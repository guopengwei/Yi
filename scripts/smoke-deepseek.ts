import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";
import {
  buildDeepSeekRequest,
  createReflection,
  DEEPSEEK_MODEL,
  validateReflectionCandidate,
  type SourceExcerpt,
} from "../worker/lib/deepseek";
import type { Env } from "../worker/env";

function responseText(output: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> | undefined) {
  return output?.flatMap((item) => item.type === "message"
    ? item.content?.flatMap((part) => part.type === "output_text" && part.text ? [part.text] : []) ?? []
    : []).join("") ?? "";
}

function parseEnv(source: string) {
  return new Map(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    const value = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
    return [[match[1]!, value] as const];
  }));
}

async function main() {
  const values = parseEnv(await readFile(resolve(".env"), "utf8"));
  const apiKey = values.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is missing from .env");

  const facts = deriveReadingFacts(readingCreateSchema.parse({
    schemaVersion: "reading-create@1",
    clientRequestId: "00000000-0000-4000-8000-000000000064",
    castingMethod: "three-number@1",
    inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition: 1 },
    question: { kind: "none" },
    timezone: "Asia/Hong_Kong",
  }));
  const source: SourceExcerpt = {
    id: "live-smoke:en:primary",
    releaseId: "00000000-0000-4000-8000-000000000064",
    entryKey: `hexagram:${facts.primary.id}`,
    text: "A rights-cleared test excerpt: notice what is verifiable, bounded, and reversible before choosing a next step.",
    locale: "en",
    approvalStatus: "approved",
    rightsStatus: "commissioned",
    provenance: { title: "Yi live smoke fixture", creator: "Yi test suite", locator: "fixture 1" },
  };
  const result = await createReflection({
    CATALOG_REVIEWED: "true",
    AI_ENABLED: "true",
    DEEPSEEK_API_KEY: apiKey,
  } as Env, {
    facts,
    question: { kind: "none" },
    locale: "en",
    includeQuestion: false,
    sources: [source],
    safetyRouted: false,
    providerAllowed: true,
  });

  let diagnostics: Record<string, unknown> | null = null;
  if (result.fallbackReason === "provider-failure") {
    const request = buildDeepSeekRequest({ facts, question: { kind: "none" }, locale: "en", includeQuestion: false, sources: [source] });
    const response = await fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json() as {
      id?: string;
      status?: string;
      error?: { type?: string; code?: string; message?: string };
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: unknown;
    };
    const content = responseText(body.output);
    let parsed: Record<string, unknown> | null = null;
    if (content) {
      try { parsed = JSON.parse(content) as Record<string, unknown>; } catch { /* reported below */ }
    }
    diagnostics = {
      status: response.status,
      responseId: body.id ?? null,
      responseStatus: body.status ?? null,
      error: body.error ? { type: body.error.type, code: body.error.code, message: body.error.message?.slice(0, 240) } : null,
      usage: body.usage ?? null,
      contentLength: content.length,
      jsonValid: parsed !== null,
      objectKeys: parsed ? Object.keys(parsed).sort() : [],
      schemaVersion: parsed?.schemaVersion ?? null,
      sourceRefsShape: Array.isArray(parsed?.sourceRefs)
        ? parsed.sourceRefs.map((item) => typeof item === "string" ? "string" : typeof item)
        : null,
      sourceRefIds: Array.isArray(parsed?.sourceRefs)
        ? parsed.sourceRefs.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "id" in item ? String(item.id) : null)
        : null,
      grounding: parsed?.grounding ?? null,
      validation: parsed ? validateReflectionCandidate(parsed) : null,
    };
  }

  const report = {
    success: result.fallbackReason === null,
    model: DEEPSEEK_MODEL,
    fallbackReason: result.fallbackReason,
    latencyMs: result.latencyMs,
    usage: result.usage,
    sourceReferenceCount: result.reflection.sourceRefs.length,
    groundingMatches: result.reflection.grounding.primaryPattern === facts.primary.pattern
      && result.reflection.grounding.relatingPattern === facts.relating.pattern,
    diagnostics,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DeepSeek smoke test failed");
  process.exitCode = 1;
});
