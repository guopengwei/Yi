import OpenAI from "openai";
import { z } from "zod";
import type { CastFacts } from "../../shared/casting";
import type { Locale } from "../../shared/catalog";
import type { ReadingQuestion } from "../../shared/contracts";
import type { Env } from "../env";

export const DEEPSEEK_MODEL = "deepseek-v4-flash" as const;
export const REFLECTION_PROMPT_VERSION = "yi-reflection@3" as const;
export const REFLECTION_MAX_OUTPUT_TOKENS = 32_000;
export const CHAT_PROMPT_VERSION = "yi-chat@3" as const;
export const DEEPSEEK_TIMEOUT_MS = 90_000;

const INPUT_CACHE_HIT_MICROS_PER_MILLION = 2_800;
const INPUT_CACHE_MISS_MICROS_PER_MILLION = 140_000;
const OUTPUT_MICROS_PER_MILLION = 280_000;

const outputLanguages: Record<Locale, string> = {
  "zh-HK": "Traditional Chinese as used in Hong Kong (繁體中文)",
  "zh-CN": "Simplified Chinese (简体中文)",
  en: "English",
};

function outputLanguageInstruction(locale: Locale) {
  return `Output language: ${outputLanguages[locale]}. Use this language for every user-visible string, regardless of the language used in source excerpts or earlier conversation messages.`;
}

const reflectionSchema = z.object({
  schemaVersion: z.literal("ai-reflection@1"),
  summary: z.string().min(1).max(2_000),
  perspective: z.string().min(1).max(12_000),
  questionsToConsider: z.array(z.string().min(1).max(300)).min(1).max(3),
  cautions: z.array(z.string().min(1).max(300)).max(3),
  sourceRefs: z.array(z.string().min(1).max(160)).max(24),
  grounding: z.object({
    primaryPattern: z.string().regex(/^[01]{6}$/),
    relatingPattern: z.string().regex(/^[01]{6}$/),
    changingPositions: z.array(z.number().int().min(1).max(6)).max(6),
  }).strict(),
}).strict();

export type AiReflection = z.infer<typeof reflectionSchema>;

export interface ReflectionValidationIssue {
  path: string;
  code: string;
  message: string;
}

/** Returns schema diagnostics without returning any provider-generated content. */
export function validateReflectionCandidate(value: unknown):
  | { success: true }
  | { success: false; issues: ReflectionValidationIssue[] } {
  const result = reflectionSchema.safeParse(value);
  if (result.success) return { success: true };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })),
  };
}

export const sourceExcerptSchema = z.object({
  id: z.string().min(1).max(200),
  releaseId: z.uuid(),
  entryKey: z.string().min(1).max(200),
  text: z.string().min(1).max(8_000),
  locale: z.enum(["zh-HK", "zh-CN", "en"]),
  approvalStatus: z.literal("approved"),
  rightsStatus: z.enum(["public-domain-mark", "permission", "commissioned"]),
  provenance: z.object({
    title: z.string().min(1).max(500),
    creator: z.string().max(300).optional(),
    publication: z.string().max(500).optional(),
    locator: z.string().min(1).max(500),
    sourceUrl: z.url().max(2_000).optional(),
  }).strict(),
}).strict();

export type SourceExcerpt = z.infer<typeof sourceExcerptSchema>;

export function parseSourceSnapshot(json: string | null, included: boolean): SourceExcerpt[] {
  if (!json || !included) return [];
  try {
    // A reading may carry every required entry in all three supported locales.
    // The current casting method needs three entries (nine localized records),
    // while this bound also keeps legacy multi-line snapshots readable.
    const parsed = z.array(sourceExcerptSchema).max(32).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export interface DeepSeekRequestBody {
  model: typeof DEEPSEEK_MODEL;
  reasoning: { effort: "high" };
  max_output_tokens: number;
  text: { format: { type: "json_object" } };
  instructions: string;
  input: string | Array<{ role: "user" | "assistant"; content: string }>;
}

export function estimateDeepSeekReservation(payload: unknown, maxOutputTokens: number) {
  // Over-reserve without logging content: each serialized code unit is counted
  // as a token, plus headroom for the fixed system prompt.
  const inputTokens = JSON.stringify(payload).length + 4_096;
  const estimatedTokens = inputTokens + maxOutputTokens;
  const estimatedSpendMicros = Math.ceil((
    inputTokens * INPUT_CACHE_MISS_MICROS_PER_MILLION
    + maxOutputTokens * OUTPUT_MICROS_PER_MILLION
  ) / 1_000_000);
  return { estimatedTokens, estimatedSpendMicros };
}

export function buildDeepSeekRequest(input: {
  facts: CastFacts;
  question: ReadingQuestion;
  locale: Locale;
  includeQuestion: boolean;
  sources: readonly SourceExcerpt[];
}): DeepSeekRequestBody {
  const safeFacts = {
    primary: input.facts.primary,
    relating: input.facts.relating,
    changingPositions: input.facts.cast.changingPositions,
    movingLines: input.facts.movingLines,
    specialLine: input.facts.specialLine,
  };
  return {
    model: DEEPSEEK_MODEL,
    reasoning: { effort: "high" },
    max_output_tokens: REFLECTION_MAX_OUTPUT_TOKENS,
    text: { format: { type: "json_object" } },
    instructions: [
      `You are Yi, a thoughtful cultural reflection assistant. Reply only with JSON matching ${REFLECTION_PROMPT_VERSION}.`,
      outputLanguageInstruction(input.locale),
      "Treat the reading as a cultural prompt for reflection, never a prediction or instruction.",
      "Use only the supplied deterministic facts and approved source excerpts. Never invent quotations or source identifiers.",
      "The user payload's takashimaInterpretationGuidance is approved context from Takashima Donsho's Takashima Ekidan (高島吞象《高島易斷》). Use its excerpts as the primary interpretation guidance for the reflection and cite every excerpt used via its exact approved ID in sourceRefs.",
      "Respect each excerpt's entryKey: hexagram entries are compilations of the six line texts, not independent Judgment or Image records; moving-line and special-line entries contain the corresponding complete commentary.",
      "Produce a substantial, specific visible reflection rather than a brief overview. Keep summary to 2-4 sentences, then make perspective 700-1,100 words in English or comparably detailed in the requested Chinese locale.",
      "Organize perspective into 6-9 clear paragraphs separated by blank lines. Examine the primary pattern, relating pattern, each supplied changing line (when any), tensions between them, at least two plausible interpretations, practical implications, uncertainties, and a grounded synthesis.",
      "Connect every observation to supplied facts, approved source material, or explicitly label it as a reflective possibility. Do not pad, repeat the summary, or claim access to facts that were withheld.",
      "Detailed visible analysis is required, but never reveal private chain-of-thought, hidden reasoning, or internal deliberation.",
      "sourceRefs MUST be a JSON array containing only approved source ID strings. Never place source objects, excerpts, provenance, or entry keys in sourceRefs.",
      "Return exactly 3 distinct questionsToConsider items and 0-3 cautions items. Three is a hard maximum for each array.",
      "Do not expose hidden reasoning.",
      'Shape: {"schemaVersion":"ai-reflection@1","summary":"...","perspective":"...","questionsToConsider":["..."],"cautions":[],"sourceRefs":[],"grounding":{"primaryPattern":"000000","relatingPattern":"000000","changingPositions":[]}}',
    ].join("\n"),
    input: JSON.stringify({
      locale: input.locale,
      facts: safeFacts,
      question: input.includeQuestion ? input.question : { kind: "withheld" },
      takashimaInterpretationGuidance: {
        attribution: "高島吞象《高島易斷》 / Takashima Donsho, Takashima Ekidan",
        role: "Primary approved interpretation guidance for this reflection",
        excerpts: input.sources,
      },
    }),
  };
}

function normalizeProviderReflection(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    ...(Array.isArray(candidate.questionsToConsider)
      ? { questionsToConsider: candidate.questionsToConsider.slice(0, 3) }
      : {}),
    ...(Array.isArray(candidate.cautions) ? { cautions: candidate.cautions.slice(0, 3) } : {}),
  };
}

function deterministicCopy(facts: CastFacts, locale: Locale, reason: string, sourceAvailable: boolean): AiReflection {
  const primaryName = facts.primary.names[locale];
  const relatingName = facts.relating.names[locale];
  const moving = facts.cast.changingPositions.length > 0
    ? facts.cast.changingPositions.join(", ")
    : locale === "en" ? "none" : "無";
  const localized = {
    "zh-HK": {
      summary: `${primaryName} 變為 ${relatingName}。這裡只呈現可重現的卦象事實。`,
      perspective: sourceAvailable
        ? `動爻位置：${moving}。AI 解讀暫時未能生成；經審核的來源目錄仍然可用，你可以先參考上方的來源解讀，並從問題的界線、可驗證的事實，以及下一個小步驟出發，自行反思。`
        : `動爻位置：${moving}。來源目錄與 AI 暫時不可用，因此沒有生成來源解讀；你仍然可以從問題的界線、可驗證的事實，以及下一個小步驟出發，自行反思。`,
      questions: ["目前最需要釐清的是事實、感受，還是選擇？", "哪一個最小行動既可逆又能帶來新資訊？"],
      caution: "不要把卦象當作預測、診斷或專業建議。",
    },
    "zh-CN": {
      summary: `${primaryName} 变为 ${relatingName}。这里只呈现可重现的卦象事实。`,
      perspective: sourceAvailable
        ? `动爻位置：${moving}。AI 解读暂时未能生成；经审核的来源目录仍然可用，你可以先参考上方的来源解读，并从问题的边界、可验证的事实，以及下一个小步骤出发，自行反思。`
        : `动爻位置：${moving}。来源目录与 AI 暂时不可用，因此没有生成来源解读；你仍然可以从问题的边界、可验证的事实，以及下一个小步骤出发，自行反思。`,
      questions: ["目前最需要厘清的是事实、感受，还是选择？", "哪一个最小行动既可逆又能带来新信息？"],
      caution: "不要把卦象当作预测、诊断或专业建议。",
    },
    en: {
      summary: `${primaryName} changes to ${relatingName}. This is a reproducible statement of the cast only.`,
      perspective: sourceAvailable
        ? `Changing line positions: ${moving}. The AI interpretation could not be generated, but the reviewed source catalog remains available above. You can still reflect on the boundary of the question, verifiable facts, and one small next step.`
        : `Changing line positions: ${moving}. The reviewed source catalog or AI is unavailable, so no sourced interpretation was generated. You can still reflect on the boundary of the question, verifiable facts, and one small next step.`,
      questions: ["What needs clarity first: facts, feelings, or choices?", "What small, reversible action could produce useful information?"],
      caution: "Do not treat a reading as prediction, diagnosis, or professional advice.",
    },
  }[locale];
  return {
    schemaVersion: "ai-reflection@1",
    summary: localized.summary,
    perspective: `${localized.perspective} (${reason})`,
    questionsToConsider: localized.questions,
    cautions: [localized.caution],
    sourceRefs: [],
    grounding: {
      primaryPattern: facts.primary.pattern,
      relatingPattern: facts.relating.pattern,
      changingPositions: [...facts.cast.changingPositions],
    },
  };
}

export interface ReflectionResult {
  reflection: AiReflection;
  fallbackReason: string | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number; spendMicros: number };
  latencyMs: number;
}

function deepSeekUsage(inputTokens: number, outputTokens: number, cachedInputTokens: number): ReflectionResult["usage"] {
  const boundedCachedInputTokens = Math.min(inputTokens, Math.max(0, cachedInputTokens));
  const cacheMissInputTokens = inputTokens - boundedCachedInputTokens;
  const spendMicros = Math.ceil((
    boundedCachedInputTokens * INPUT_CACHE_HIT_MICROS_PER_MILLION
    + cacheMissInputTokens * INPUT_CACHE_MISS_MICROS_PER_MILLION
    + outputTokens * OUTPUT_MICROS_PER_MILLION
  ) / 1_000_000);
  return {
    inputTokens,
    cachedInputTokens: boundedCachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    spendMicros,
  };
}

export async function createReflection(env: Env, input: {
  facts: CastFacts;
  question: ReadingQuestion;
  locale: Locale;
  includeQuestion: boolean;
  sources: readonly SourceExcerpt[];
  safetyRouted: boolean;
  providerAllowed: boolean;
}): Promise<ReflectionResult> {
  const startedAt = Date.now();
  const fallback = (reason: string): ReflectionResult => ({
    reflection: deterministicCopy(input.facts, input.locale, reason, input.sources.length > 0),
    fallbackReason: reason,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, spendMicros: 0 },
    latencyMs: Date.now() - startedAt,
  });
  if (input.safetyRouted) return fallback("safety-routed");
  if (!input.providerAllowed) return fallback("ai-disabled");
  if (env.CATALOG_REVIEWED !== "true" || input.sources.length === 0) return fallback("catalog-unreviewed");
  if (env.AI_ENABLED !== "true") return fallback("ai-disabled");
  if (!env.DEEPSEEK_API_KEY) return fallback("provider-unconfigured");
  if (input.sources.some((source) => source.approvalStatus !== "approved")) return fallback("source-unapproved");

  const request = buildDeepSeekRequest(input);
  try {
    const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: DEEPSEEK_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.responses.create(request as OpenAI.Responses.ResponseCreateParamsNonStreaming);
    const content = response.output_text;
    if (!content) return fallback("provider-empty");
    const parsed = reflectionSchema.parse(normalizeProviderReflection(JSON.parse(content)));
    const allowedSourceIds = new Set(input.sources.map((source) => source.id));
    if (parsed.sourceRefs.some((id) => !allowedSourceIds.has(id))) return fallback("fabricated-source");
    if (parsed.grounding.primaryPattern !== input.facts.primary.pattern ||
      parsed.grounding.relatingPattern !== input.facts.relating.pattern ||
      JSON.stringify(parsed.grounding.changingPositions) !== JSON.stringify(input.facts.cast.changingPositions)) {
      return fallback("grounding-mismatch");
    }
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cachedInputTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    return {
      reflection: parsed,
      fallbackReason: null,
      usage: deepSeekUsage(inputTokens, outputTokens, cachedInputTokens),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return fallback(error instanceof OpenAI.APIConnectionTimeoutError ? "provider-timeout" : "provider-failure");
  }
}

export interface ChatContext {
  facts: CastFacts;
  reflection: AiReflection | null;
  question: ReadingQuestion | { kind: "withheld" };
  sources: readonly SourceExcerpt[];
  locale: Locale;
  safetyRouted: boolean;
}

export function buildChatDeepSeekRequest(input: {
  context: ChatContext;
  messages: readonly { role: "user" | "assistant"; content: string }[];
}): DeepSeekRequestBody {
  return {
    model: DEEPSEEK_MODEL,
    reasoning: { effort: "high" },
    max_output_tokens: 900,
    text: { format: { type: "json_object" } },
    instructions: [
      "You are Yi, a restrained cultural reflection assistant.",
      outputLanguageInstruction(input.context.locale),
      "Use only the immutable reading context and approved sources. Do not predict, prescribe, diagnose, or expose hidden reasoning.",
      "sourceRefs MUST contain approved source ID strings only, never source objects or excerpts.",
      "Reply as JSON: {\"reply\":\"plain text\",\"sourceRefs\":[\"approved-id\"]}. Never invent source IDs.",
    ].join("\n"),
    input: [
      { role: "user", content: JSON.stringify({ immutableContext: input.context }) },
      ...input.messages.slice(-20),
    ],
  };
}

export async function createChatReply(env: Env, input: {
  context: ChatContext;
  messages: readonly { role: "user" | "assistant"; content: string }[];
  providerAllowed: boolean;
}): Promise<{ content: string; fallbackReason: string | null; usage: ReflectionResult["usage"]; latencyMs: number }> {
  const startedAt = Date.now();
  const fallback = (reason: string) => ({
    content: input.context.locale === "en"
      ? `I can help you examine the reading facts, but the reviewed source-grounded AI service is unavailable (${reason}). What part of the situation is within your control today?`
      : input.context.locale === "zh-CN"
        ? `我可以陪你梳理卦象事实，不过经审核、基于来源的 AI 服务目前不可用（${reason}）。今天有哪些部分，是你可以掌控的？`
        : `我可以陪你梳理卦象事實，不過經審核、以來源為依據的 AI 服務目前不可用（${reason}）。今天有哪些部分，是你可以掌控的？`,
    fallbackReason: reason,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, spendMicros: 0 },
    latencyMs: Date.now() - startedAt,
  });
  if (input.context.safetyRouted) return fallback("safety-routed");
  if (!input.providerAllowed) return fallback("ai-disabled");
  if (env.CATALOG_REVIEWED !== "true" || input.context.sources.length === 0) return fallback("catalog-unreviewed");
  if (env.AI_ENABLED !== "true") return fallback("ai-disabled");
  if (!env.DEEPSEEK_API_KEY) return fallback("provider-unconfigured");
  const request = buildChatDeepSeekRequest(input);
  try {
    const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: DEEPSEEK_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.responses.create(request as OpenAI.Responses.ResponseCreateParamsNonStreaming);
    const parsed = z.object({ reply: z.string().min(1).max(4_000), sourceRefs: z.array(z.string()).max(24) }).strict()
      .parse(JSON.parse(response.output_text));
    const allowed = new Set(input.context.sources.map((source) => source.id));
    if (parsed.sourceRefs.some((id) => !allowed.has(id))) return fallback("fabricated-source");
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cachedInputTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    return {
      content: parsed.reply,
      fallbackReason: null,
      usage: deepSeekUsage(inputTokens, outputTokens, cachedInputTokens),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return fallback(error instanceof OpenAI.APIConnectionTimeoutError ? "provider-timeout" : "provider-failure");
  }
}
