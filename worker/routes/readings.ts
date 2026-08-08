import { Hono } from "hono";
import { z } from "zod";
import { deriveReadingFacts } from "../../shared/casting";
import { aiConsentSchema, contributionSchema, readingCreateSchema } from "../../shared/contracts";
import { routeSafety } from "../../shared/safety";
import type { AppVariables, Env } from "../env";
import { optionalSession, requireSession } from "../lib/auth";
import { isProviderEnabled } from "../lib/ai-config";
import { reserveBudget } from "../lib/budget";
import { canonicalFingerprint } from "../lib/crypto";
import { createReflection, DEEPSEEK_MODEL, estimateDeepSeekReservation, parseSourceSnapshot, REFLECTION_PROMPT_VERSION } from "../lib/deepseek";
import { ApiError } from "../lib/errors";
import { assertTimezone, clientIp, parseJson, requestLocale } from "../lib/http";
import { guestIdentity, type Identity } from "../lib/identity";
import { createCheckoutSession } from "../lib/payments";
import { archiveReading, ownedReading, publicReading } from "../lib/readings";
import { reviewedSourceSnapshot } from "../lib/source-catalog";
import { enforceRateLimit } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function requestIdentity(c: Parameters<typeof optionalSession>[0]): Promise<{ identity: Identity; session: Awaited<ReturnType<typeof optionalSession>> }> {
  const session = await optionalSession(c);
  if (session) return { identity: { kind: "user", key: `user:${session.user.id}`, userId: session.user.id, guestIdHash: null }, session };
  return { identity: await guestIdentity(c), session: null };
}

routes.post("/", async (c) => {
  const request = await parseJson(c, readingCreateSchema);
  assertTimezone(request.timezone);
  const { identity } = await requestIdentity(c);
  const fingerprint = await canonicalFingerprint(request);
  const existing = await c.env.DB.prepare(`
    SELECT * FROM reading_operations WHERE identity_key = ? AND client_request_id = ?
  `).bind(identity.key, request.clientRequestId).first<import("../lib/readings").ReadingRow>();
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was already used for a different request.");
    return c.json({ schemaVersion: "reading-operation@1", ...publicReading(existing) });
  }

  const derivedFacts = deriveReadingFacts(request);
  const sourceSnapshot = await reviewedSourceSnapshot(c.env, derivedFacts, requestLocale(c));
  const facts = sourceSnapshot.length > 0
    ? { ...derivedFacts, sourceStatus: "reviewed" as const, systemStatus: "source-grounded-enabled" as const }
    : derivedFacts;
  const safety = routeSafety(request.question, requestLocale(c));
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = identity.kind === "guest" ? now + 7 * 24 * 60 * 60 * 1000 : null;
  await c.env.DB.prepare(`
    INSERT INTO reading_operations(
      id, client_request_id, identity_key, user_id, guest_id_hash, request_fingerprint,
      casting_method, question_text, question_kind, timezone, facts_json, source_snapshot_json, safety_json,
      status, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_contribution', ?, ?, ?)
  `).bind(
    id,
    request.clientRequestId,
    identity.key,
    identity.userId,
    identity.guestIdHash,
    fingerprint,
    request.castingMethod,
    request.question.kind === "question" ? request.question.text : null,
    request.question.kind,
    request.timezone,
    JSON.stringify(facts),
    sourceSnapshot.length > 0 ? JSON.stringify(sourceSnapshot) : null,
    JSON.stringify(safety),
    now,
    now,
    expiresAt,
  ).run();
  return c.json({
    schemaVersion: "reading-operation@1",
    id,
    status: "awaiting_contribution",
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  }, 201);
});

routes.get("/:id", async (c) => {
  const { identity } = await requestIdentity(c);
  const reading = await ownedReading(c, c.req.param("id"), identity);
  return c.json({ schemaVersion: "reading-operation@1", ...publicReading(reading) });
});

routes.post("/:id/contribution", async (c) => {
  const body = await parseJson(c, contributionSchema);
  const { identity, session } = await requestIdentity(c);
  const reading = await ownedReading(c, c.req.param("id"), identity);
  if (reading.status === "ready") return c.json({ schemaVersion: "contribution@1", status: "ready", readingId: reading.id });
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", 400, "A cryptographic UUID Idempotency-Key header is required.");
  }
  const now = Date.now();
  const prior = await c.env.DB.prepare("SELECT id, reading_operation_id, amount_hkd, status FROM contributions WHERE id = ?")
    .bind(idempotencyKey).first<{ id: string; reading_operation_id: string; amount_hkd: number; status: string }>();
  if (prior && (prior.amount_hkd !== body.amountHkd || prior.reading_operation_id !== reading.id)) {
    throw new ApiError("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was already used for a different contribution.");
  }

  if (body.amountHkd === 0) {
    if (!prior) {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO contributions(id, reading_operation_id, user_id, amount_hkd, status, created_at, updated_at) VALUES (?, ?, ?, 0, 'free', ?, ?)`)
          .bind(idempotencyKey, reading.id, identity.userId, now, now),
        c.env.DB.prepare("UPDATE reading_operations SET status = 'ready', contribution_amount_hkd = 0, updated_at = ? WHERE id = ? AND status = 'awaiting_contribution'")
          .bind(now, reading.id),
      ]);
    }
    return c.json({ schemaVersion: "contribution@1", status: "ready", readingId: reading.id });
  }

  await enforceRateLimit(c.env, { bucket: "payment-create", identity: `${identity.key}:${clientIp(c)}`, limit: 8, windowMs: 60 * 60 * 1000 });
  await verifyTurnstile(c.env, { token: body.turnstileToken, action: "payment_create", remoteIp: clientIp(c), idempotencyKey });
  if (!prior) {
    await c.env.DB.prepare(`
      INSERT INTO contributions(id, reading_operation_id, user_id, amount_hkd, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'checkout_created', ?, ?)
    `).bind(idempotencyKey, reading.id, identity.userId, body.amountHkd, now, now).run();
  }
  const checkout = await createCheckoutSession(c.env, {
    contributionId: idempotencyKey,
    readingId: reading.id,
    amountHkd: body.amountHkd,
    locale: requestLocale(c),
    userEmail: session?.user.email,
  });
  if (!checkout.url) throw new ApiError("CHECKOUT_CREATE_FAILED", 502, "Checkout did not return a redirect URL.", true);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE contributions SET status = 'checkout_created', stripe_checkout_session_id = ?, updated_at = ? WHERE id = ?")
      .bind(checkout.id, Date.now(), idempotencyKey),
    c.env.DB.prepare("UPDATE reading_operations SET status = 'payment_pending', contribution_amount_hkd = ?, updated_at = ? WHERE id = ? AND status IN ('awaiting_contribution', 'payment_pending')")
      .bind(body.amountHkd, Date.now(), reading.id),
  ]);
  return c.json({ schemaVersion: "contribution@1", status: "payment_pending", checkoutUrl: checkout.url });
});

routes.post("/:id/reflection", async (c) => {
  const consent = await parseJson(c, aiConsentSchema);
  const { identity } = await requestIdentity(c);
  const reading = await ownedReading(c, c.req.param("id"), identity);
  if (reading.status !== "ready") throw new ApiError("READING_NOT_READY", 409, "Complete the contribution step first.");
  if (reading.reflection_json) {
    return c.json({ schemaVersion: "reflection-operation@1", reflection: JSON.parse(reading.reflection_json), cached: true });
  }
  if (identity.kind === "guest") {
    await enforceRateLimit(c.env, { bucket: "guest-ai", identity: `${identity.key}:${clientIp(c)}`, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    await verifyTurnstile(c.env, { token: consent.turnstileToken, action: "guest_ai", remoteIp: clientIp(c), idempotencyKey: crypto.randomUUID() });
  }
  const facts = JSON.parse(reading.facts_json) as import("../../shared/casting").CastFacts;
  const safety = JSON.parse(reading.safety_json) as ReturnType<typeof routeSafety>;
  const question = reading.question_kind === "question" && reading.question_text
    ? { kind: "question" as const, text: reading.question_text }
    : { kind: "none" as const };
  const sources = parseSourceSnapshot(reading.source_snapshot_json, consent.includeSourceMaterial);
  let providerEligible = !safety.routed && sources.length > 0 && await isProviderEnabled(c.env);
  const operationId = crypto.randomUUID();
  let budget: Awaited<ReturnType<typeof reserveBudget>> | null = null;
  if (providerEligible) {
    const estimate = estimateDeepSeekReservation({ facts, question: consent.includeQuestion ? question : { kind: "withheld" }, sources }, 1_200);
    try {
      budget = await reserveBudget(c.env, {
        reservationId: operationId,
        identityKey: identity.key,
        kind: "reflection",
        registered: identity.kind === "user",
        ...estimate,
        enforceGlobal: true,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code === "DAILY_AI_LIMIT") throw error;
      providerEligible = false;
    }
  }
  const result = await createReflection(c.env, {
    facts,
    question,
    locale: requestLocale(c),
    includeQuestion: consent.includeQuestion,
    sources,
    safetyRouted: safety.routed,
    providerAllowed: providerEligible,
  });
  if (budget) {
    await budget.reconcile(result.usage.totalTokens, result.usage.spendMicros, result.fallbackReason ? "failure" : "success");
  }
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE reading_operations SET reflection_json = ?, reflection_included_question = ?, prompt_version = ?, model_version = ?, updated_at = ?
      WHERE id = ? AND identity_key = ? AND reflection_json IS NULL
    `).bind(JSON.stringify(result.reflection), consent.includeQuestion ? 1 : 0, REFLECTION_PROMPT_VERSION, DEEPSEEK_MODEL, now, reading.id, identity.key),
    c.env.DB.prepare(`
      INSERT INTO ai_operations(
        id, reading_operation_id, user_id, identity_key, operation_kind, model_version, prompt_version,
        status, safety_outcome, input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at
      ) VALUES (?, ?, ?, ?, 'reflection', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      operationId,
      reading.id,
      identity.userId,
      identity.key,
      DEEPSEEK_MODEL,
      REFLECTION_PROMPT_VERSION,
      result.fallbackReason ? "fallback" : "success",
      safety.routed ? "routed" : "clear",
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.spendMicros,
      result.latencyMs,
      result.fallbackReason,
      now,
    ),
    c.env.DB.prepare(`
      UPDATE archived_readings
      SET reflection_json = ?, reflection_included_question = ?, updated_at = ?
      WHERE reading_operation_id = ? AND user_id = ?
    `).bind(JSON.stringify(result.reflection), consent.includeQuestion ? 1 : 0, now, reading.id, identity.userId),
  ]);
  return c.json({
    schemaVersion: "reflection-operation@1",
    reflection: result.reflection,
    fallbackReason: result.fallbackReason,
    remaining: budget?.remaining ?? null,
  });
});

routes.post("/:id/archive", async (c) => {
  const session = await requireSession(c);
  const identity: Identity = { kind: "user", key: `user:${session.user.id}`, userId: session.user.id, guestIdHash: null };
  const reading = await ownedReading(c, c.req.param("id"), identity);
  const body = await parseJson(c, z.object({ title: z.string().trim().max(120).optional() }).strict());
  const archiveId = await archiveReading(c.env, { userId: session.user.id, reading, title: body.title });
  return c.json({ schemaVersion: "archive@1", archiveId }, 201);
});

export default routes;
