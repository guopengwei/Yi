import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";
import { buildDeepSeekRequest, createReflection, estimateDeepSeekReservation, type SourceExcerpt } from "../worker/lib/deepseek";
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
  text: "Reviewed source excerpt.",
  locale: "en",
  approvalStatus: "approved",
  rightsStatus: "commissioned",
  provenance: { title: "Commissioned Yi commentary", locator: "entry 12" },
};

function env(): Env {
  return { CATALOG_REVIEWED: "true", AI_ENABLED: "true", DEEPSEEK_API_KEY: "test-key" } as Env;
}

afterEach(() => vi.restoreAllMocks());

describe("DeepSeek adapter", () => {
  it("reserves against prompt size instead of a fixed token guess", () => {
    const small = estimateDeepSeekReservation({ text: "short" }, 100);
    const large = estimateDeepSeekReservation({ text: "長".repeat(10_000) }, 100);
    expect(large.estimatedTokens).toBeGreaterThan(small.estimatedTokens + 9_000);
    expect(large.estimatedSpendMicros).toBeGreaterThan(small.estimatedSpendMicros);
  });
  it("builds the exact bounded thinking request without temperature", () => {
    const body = buildDeepSeekRequest({ facts, question: { kind: "question", text: "What can I clarify?" }, locale: "en", includeQuestion: false, sources: [source] });
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning_effort: "high",
      thinking: { type: "enabled" },
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(JSON.parse(body.messages[1]!.content).question).toEqual({ kind: "withheld" });
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "deepseek-v4-flash",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({
        schemaVersion: "ai-reflection@1",
        summary: "A summary",
        perspective: "A perspective",
        questionsToConsider: ["A question?"],
        cautions: [],
        sourceRefs: ["fabricated"],
        grounding: { primaryPattern: facts.primary.pattern, relatingPattern: facts.relating.pattern, changingPositions: facts.cast.changingPositions },
      }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "chatcmpl-bounded",
      object: "chat.completion",
      created: 1,
      model: "deepseek-v4-flash",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({
        schemaVersion: "ai-reflection@1",
        summary: "A summary",
        perspective: "A perspective",
        questionsToConsider: ["One?", "Two?", "Three?", "Four?"],
        cautions: ["One.", "Two.", "Three.", "Four."],
        sourceRefs: [source.id],
        grounding: { primaryPattern: facts.primary.pattern, relatingPattern: facts.relating.pattern, changingPositions: facts.cast.changingPositions },
      }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
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
  });
});
