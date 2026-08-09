import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";
import { buildChatDeepSeekRequest, buildDeepSeekRequest, createReflection, estimateDeepSeekReservation, REFLECTION_MAX_OUTPUT_TOKENS, type SourceExcerpt, validateReflectionCandidate } from "../worker/lib/deepseek";
import type { Env } from "../worker/env";

const facts = deriveReadingFacts(readingCreateSchema.parse({
  schemaVersion: "reading-create@1",
  clientRequestId: "00000000-0000-4000-8000-000000000001",
  castingMethod: "three-number@1",
  inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition: 1 },
  question: { kind: "question", text: "What can I clarify?" },
  timezone: "Asia/Hong_Kong",
}));

const source: SourceExcerpt = {
  id: "release-1:en:hexagram:kw-12",
  releaseId: "00000000-0000-4000-8000-000000000099",
  entryKey: `hexagram:${facts.primary.id}`,
  text: "Approved Takashima interpretation guidance for this line.",
  locale: "en",
  approvalStatus: "approved",
  rightsStatus: "commissioned",
  provenance: { title: "高島易斷 — approved catalog", locator: "entry 12" },
};

function env(): Env {
  return { CATALOG_REVIEWED: "true", AI_ENABLED: "true", DEEPSEEK_API_KEY: "test-key" } as Env;
}

function providerResponse(content: unknown, cachedTokens = 0) {
  return new Response(JSON.stringify({
    id: "resp-test",
    object: "response",
    created_at: 1,
    status: "completed",
    model: "deepseek-v4-flash",
    output: [{
      id: "msg-test",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(content), annotations: [] }],
    }],
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: cachedTokens },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: 30,
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.restoreAllMocks());

describe("DeepSeek adapter", () => {
  it("reserves against prompt size instead of a fixed token guess", () => {
    const small = estimateDeepSeekReservation({ text: "short" }, 100);
    const large = estimateDeepSeekReservation({ text: "長".repeat(10_000) }, 100);
    expect(large.estimatedTokens).toBeGreaterThan(small.estimatedTokens + 9_000);
    expect(large.estimatedSpendMicros).toBeGreaterThan(small.estimatedSpendMicros);
  });
  it("builds the exact bounded Responses API request without temperature", () => {
    const body = buildDeepSeekRequest({ facts, question: { kind: "question", text: "What can I clarify?" }, locale: "en", includeQuestion: false, sources: [source] });
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning: { effort: "high" },
      max_output_tokens: REFLECTION_MAX_OUTPUT_TOKENS,
      text: { format: { type: "json_object" } },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("messages");
    const context = JSON.parse(body.input as string);
    expect(context.question).toEqual({ kind: "withheld" });
    expect(context.takashimaInterpretationGuidance).toMatchObject({
      attribution: "高島吞象《高島易斷》 / Takashima Donsho, Takashima Ekidan",
      role: "Primary approved interpretation guidance for this reflection",
      excerpts: [{ id: source.id, entryKey: source.entryKey, text: source.text }],
    });
    expect(body.instructions).toContain("primary interpretation guidance");
    expect(body.instructions).toContain("hexagram entries are compilations");
    expect(body.instructions).toContain("700-1,100 words");
    expect(body.instructions).toContain("6-9 clear paragraphs");
  });

  it.each([
    ["zh-HK", "Traditional Chinese as used in Hong Kong (繁體中文)"],
    ["zh-CN", "Simplified Chinese (简体中文)"],
    ["en", "English"],
  ] as const)("requires reflection output in the current %s language", (locale, language) => {
    const body = buildDeepSeekRequest({ facts, question: { kind: "none" }, locale, includeQuestion: false, sources: [source] });
    expect(body.instructions).toContain(`Output language: ${language}.`);
    expect(body.instructions).toContain("Use this language for every user-visible string");
  });

  it.each([
    ["zh-HK", "Traditional Chinese as used in Hong Kong (繁體中文)"],
    ["zh-CN", "Simplified Chinese (简体中文)"],
    ["en", "English"],
  ] as const)("requires chat output in the current %s language", (locale, language) => {
    const body = buildChatDeepSeekRequest({
      context: { facts, reflection: null, question: { kind: "withheld" }, sources: [source], locale, safetyRouted: false },
      messages: [{ role: "user", content: "Please continue." }],
    });
    expect(body.instructions).toContain(`Output language: ${language}.`);
    expect(body.instructions).toContain("regardless of the language used in source excerpts or earlier conversation messages");
  });

  it("keeps chat turns as a stable input prefix for DeepSeek's automatic context cache", () => {
    const context = { facts, reflection: null, question: { kind: "withheld" } as const, sources: [source], locale: "en" as const, safetyRouted: false };
    const first = buildChatDeepSeekRequest({ context, messages: [{ role: "user", content: "First turn" }] });
    const second = buildChatDeepSeekRequest({
      context,
      messages: [
        { role: "user", content: "First turn" },
        { role: "assistant", content: "First reply" },
        { role: "user", content: "Second turn" },
      ],
    });
    expect(Array.isArray(first.input)).toBe(true);
    expect((second.input as unknown[]).slice(0, (first.input as unknown[]).length)).toEqual(first.input);
    expect(second).not.toHaveProperty("previous_response_id");
  });

  it("accepts the expanded detailed perspective size", () => {
    expect(validateReflectionCandidate({
      schemaVersion: "ai-reflection@1",
      summary: "A concise synthesis.",
      perspective: "Detailed reflection. ".repeat(300),
      questionsToConsider: ["One?", "Two?", "Three?"],
      cautions: [],
      sourceRefs: [source.id],
      grounding: { primaryPattern: facts.primary.pattern, relatingPattern: facts.relating.pattern, changingPositions: facts.cast.changingPositions },
    })).toEqual({ success: true });
  });

  it("does not call the provider when consent policy or safety disables it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createReflection(env(), {
      facts,
      question: { kind: "none" },
      locale: "en",
      includeQuestion: false,
      sources: [source],
      safetyRouted: false,
      providerAllowed: false,
    });
    expect(result.fallbackReason).toBe("ai-disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a fabricated source reference and exposes no reasoning", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(providerResponse({
      schemaVersion: "ai-reflection@1",
      summary: "A summary",
      perspective: "A perspective",
      questionsToConsider: ["A question?"],
      cautions: [],
      sourceRefs: ["fabricated"],
      grounding: { primaryPattern: facts.primary.pattern, relatingPattern: facts.relating.pattern, changingPositions: facts.cast.changingPositions },
    }));
    const result = await createReflection(env(), {
      facts,
      question: { kind: "none" },
      locale: "en",
      includeQuestion: false,
      sources: [source],
      safetyRouted: false,
      providerAllowed: true,
    });
    expect(result.fallbackReason).toBe("fabricated-source");
    expect(JSON.stringify(result)).not.toContain("reasoning_content");
  });

  it("bounds excess provider questions and cautions before strict validation", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(providerResponse({
      schemaVersion: "ai-reflection@1",
      summary: "A summary",
      perspective: "A perspective",
      questionsToConsider: ["One?", "Two?", "Three?", "Four?"],
      cautions: ["One.", "Two.", "Three.", "Four."],
      sourceRefs: [source.id],
      grounding: { primaryPattern: facts.primary.pattern, relatingPattern: facts.relating.pattern, changingPositions: facts.cast.changingPositions },
    }, 10));
    const result = await createReflection(env(), {
      facts,
      question: { kind: "none" },
      locale: "en",
      includeQuestion: false,
      sources: [source],
      safetyRouted: false,
      providerAllowed: true,
    });
    expect(result.fallbackReason).toBeNull();
    expect(result.reflection.questionsToConsider).toHaveLength(3);
    expect(result.reflection.cautions).toHaveLength(3);
    expect(result.usage.cachedInputTokens).toBe(10);
    expect(result.usage.spendMicros).toBe(6);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/responses");
    const request = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(request).toMatchObject({ model: "deepseek-v4-flash", reasoning: { effort: "high" } });
    expect(request).not.toHaveProperty("messages");
  });
});
