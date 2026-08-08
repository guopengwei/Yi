import OpenAI from "openai";
import { z } from "zod";
import type { CastFacts } from "../../shared/casting";
import type { Locale } from "../../shared/catalog";
import type { ReadingQuestion } from "../../shared/contracts";
import type { Env } from "../env";

export const DEEPSEEK_MODEL = "deepseek-v4-flash" as const;
export const REFLECTION_PROMPT_VERSION = "yi-reflection@1" as const;
export const CHAT_PROMPT_VERSION = "yi-chat@1" as const;

const reflectionSchema = z.object({
  schemaVersion: z.literal("ai-reflection@1"),
  summary: z.string().min(1).max(900),
  perspective: z.string().min(1).max(1800),
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
    const parsed = z.array(sourceExcerptSchema).max(10).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export interface DeepSeekRequestBody {
  model: typeof DEEPSEEK_MODEL;
  reasoning_effort: "high";
  thinking: { type: "enabled" };
  max_tokens: number;
  response_format: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
}

export function estimateDeepSeekReservation(payload: unknown, maxOutputTokens: number) {
  // Over-reserve without logging content: each serialized code unit is counted
  // as a token, plus headroom for the fixed system prompt.
  const inputTokens = JSON.stringify(payload).length + 4_096;
  const estimatedTokens = inputTokens + maxOutputTokens;
  const estimatedSpendMicros = Math.ceil((inputTokens * 140_000 + maxOutputTokens * 280_000) / 1_000_000);
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
    reasoning_effort: "high",
    thinking: { type: "enabled" },
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are Yi, a restrained reflection assistant. Reply only with JSON matching ${REFLECTION_PROMPT_VERSION}.`,
          "Treat the reading as a cultural prompt for reflection, never a prediction or instruction.",
          "Use only the supplied deterministic facts and approved source excerpts. Never invent quotations or source identifiers.",
          "sourceRefs MUST be a JSON array containing only approved source ID strings. Never place source objects, excerpts, provenance, or entry keys in sourceRefs.",
          "Do not expose hidden reasoning. Use the requested locale.",
          'Shape: {"schemaVersion":"ai-reflection@1","summary":"...","perspective":"...","questionsToConsider":["..."],"cautions":[],"sourceRefs":[],"grounding":{"primaryPattern":"000000","relatingPattern":"000000","changingPositions":[]}}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          locale: input.locale,
          facts: safeFacts,
          question: input.includeQuestion ? input.question : { kind: "withheld" },
          approvedSources: input.sources,
        }),
      },
    ],
  };
}

function deterministicCopy(facts: CastFacts, locale: Locale, reason: string): AiReflection {
  const primaryName = facts.primary.names[locale];
  const relatingName = facts.relating.names[locale];
  const moving = facts.cast.changingPositions.length > 0
    ? facts.cast.changingPositions.join(", ")
    : locale === "en" ? "none" : "無";
  const localized = {
    "zh-HK": {
      summary: `${primaryName} 變為 ${relatingName}。此處只呈現可重現的卦象事實。`,
      perspective: `動爻位置：${moving}。來源目錄或 AI 暫不可用，因此沒有生成來源解讀；你仍可從問題的界線、可驗證事實與下一個小步驟自行反思。`,
      questions: ["目前最需要釐清的是事實、感受，還是選擇？", "哪一個最小行動既可逆又能帶來新資訊？"],
      caution: "不要把卦象當作預測、診斷或專業建議。",
    },
    "zh-CN": {
      summary: `${primaryName} 变为 ${relatingName}。此处只呈现可重现的卦象事实。`,
      perspective: `动爻位置：${moving}。来源目录或 AI 暂不可用，因此没有生成来源解读；你仍可从问题的边界、可验证事实与下一个小步骤自行反思。`,
      questions: ["目前最需要厘清的是事实、感受，还是选择？", "哪一个最小行动既可逆又能带来新信息？"],
      caution: "不要把卦象当作预测、诊断或专业建议。",
    },
    en: {
      summary: `${primaryName} changes to ${relatingName}. This is a reproducible statement of the cast only.`,
      perspective: `Changing line positions: ${moving}. The reviewed source catalog or AI is unavailable, so no sourced interpretation was generated. You can still reflect on the boundary of the question, verifiable facts, and one small next step.`,
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
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; spendMicros: number };
  latencyMs: number;
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
    reflection: deterministicCopy(input.facts, input.locale, reason),
    fallbackReason: reason,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, spendMicros: 0 },
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
    const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 20_000, maxRetries: 0 });
    const response = await client.chat.completions.create(request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    const content = response.choices[0]?.message.content;
    if (!content) return fallback("provider-empty");
    const parsed = reflectionSchema.parse(JSON.parse(content));
    const allowedSourceIds = new Set(input.sources.map((source) => source.id));
    if (parsed.sourceRefs.some((id) => !allowedSourceIds.has(id))) return fallback("fabricated-source");
    if (parsed.grounding.primaryPattern !== input.facts.primary.pattern ||
      parsed.grounding.relatingPattern !== input.facts.relating.pattern ||
      JSON.stringify(parsed.grounding.changingPositions) !== JSON.stringify(input.facts.cast.changingPositions)) {
      return fallback("grounding-mismatch");
    }
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const spendMicros = Math.ceil((inputTokens * 140_000 + outputTokens * 280_000) / 1_000_000);
    return {
      reflection: parsed,
      fallbackReason: null,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, spendMicros },
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return fallback("provider-failure");
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
        ? `我可以陪你梳理卦象事实，但经审核、以来源为依据的 AI 服务目前不可用（${reason}）。今天有哪些部分是你可以控制的？`
        : `我可以陪你梳理卦象事實，但經審核、以來源為依據的 AI 服務目前不可用（${reason}）。今天有哪些部分是你可以控制的？`,
    fallbackReason: reason,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, spendMicros: 0 },
    latencyMs: Date.now() - startedAt,
  });
  if (input.context.safetyRouted) return fallback("safety-routed");
  if (!input.providerAllowed) return fallback("ai-disabled");
  if (env.CATALOG_REVIEWED !== "true" || input.context.sources.length === 0) return fallback("catalog-unreviewed");
  if (env.AI_ENABLED !== "true") return fallback("ai-disabled");
  if (!env.DEEPSEEK_API_KEY) return fallback("provider-unconfigured");
  const request: DeepSeekRequestBody = {
    model: DEEPSEEK_MODEL,
    reasoning_effort: "high",
    thinking: { type: "enabled" },
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are Yi, a restrained cultural reflection assistant.",
          "Use only the immutable reading context and approved sources. Do not predict, prescribe, diagnose, or expose hidden reasoning.",
          "sourceRefs MUST contain approved source ID strings only, never source objects or excerpts.",
          "Reply as JSON: {\"reply\":\"plain text\",\"sourceRefs\":[\"approved-id\"]}. Never invent source IDs.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          immutableContext: input.context,
          conversation: input.messages.slice(-20),
        }),
      },
    ],
  };
  try {
    const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 20_000, maxRetries: 0 });
    const response = await client.chat.completions.create(request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    const parsed = z.object({ reply: z.string().min(1).max(4_000), sourceRefs: z.array(z.string()).max(24) }).strict()
      .parse(JSON.parse(response.choices[0]?.message.content ?? ""));
    const allowed = new Set(input.context.sources.map((source) => source.id));
    if (parsed.sourceRefs.some((id) => !allowed.has(id))) return fallback("fabricated-source");
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    return {
      content: parsed.reply,
      fallbackReason: null,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        spendMicros: Math.ceil((inputTokens * 140_000 + outputTokens * 280_000) / 1_000_000),
      },
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return fallback("provider-failure");
  }
}
