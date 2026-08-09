import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";
import type { Env } from "../worker/env";
import { createAuth } from "../worker/lib/auth";

beforeEach(async () => {
  const migrations = (env as typeof env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
  await applyD1Migrations(env.DB, migrations);
});

function readingBody(clientRequestId = crypto.randomUUID(), changingPosition = 1) {
  return {
    schemaVersion: "reading-create@1",
    clientRequestId,
    castingMethod: "three-number@1",
    inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition },
    question: { kind: "question", text: "What can I test next?" },
    timezone: "Asia/Hong_Kong",
  };
}

async function createVerifiedSessionCookie() {
  await env.DB.prepare("DELETE FROM rateLimit").run();
  const pending: Promise<unknown>[] = [];
  const testEnv: Env = {
    ...env,
    EMAIL: { send: async () => ({ messageId: crypto.randomUUID() }) },
  };
  const auth = createAuth(testEnv, { waitUntil: (promise) => { pending.push(promise); } });
  const email = `socket-${crypto.randomUUID()}@example.test`;
  const password = "socket-repro-password";
  const post = (path: string, body: unknown) => auth.handler(new Request(`${testEnv.APP_ORIGIN}/api/auth${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: testEnv.APP_ORIGIN,
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: JSON.stringify(body),
  }));

  expect((await post("/sign-up/email", { name: "Socket Repro", email, password })).status).toBe(200);
  await Promise.all(pending.splice(0));
  await env.DB.prepare('UPDATE "user" SET emailVerified = 1 WHERE email = ?').bind(email).run();
  const signIn = await post("/sign-in/email", { email, password });
  expect(signIn.status).toBe(200);
  const sessionCookie = signIn.headers.get("Set-Cookie")?.match(/yi\.session_token=([^;]+)/)?.[0];
  expect(sessionCookie).toBeTruthy();
  return sessionCookie!;
}

describe("Worker reading lifecycle", () => {
  it("keeps facts hidden until HK$0 completion and makes retries idempotent", async () => {
    const clientRequestId = crypto.randomUUID();
    const create = await SELF.fetch("https://example.test/api/v1/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": "en" },
      body: JSON.stringify(readingBody(clientRequestId)),
    });
    expect(create.status).toBe(201);
    const cookie = create.headers.get("Set-Cookie")?.split(";", 1)[0];
    expect(cookie).toMatch(/^yi_guest=/);
    const operation = await create.json<{ id: string; status: string; facts?: unknown }>();
    expect(operation.status).toBe("awaiting_contribution");
    expect(operation).not.toHaveProperty("facts");

    const retry = await SELF.fetch("https://example.test/api/v1/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie! },
      body: JSON.stringify(readingBody(clientRequestId)),
    });
    expect(retry.status).toBe(200);
    expect((await retry.json<{ id: string }>()).id).toBe(operation.id);

    const conflict = await SELF.fetch("https://example.test/api/v1/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie! },
      body: JSON.stringify(readingBody(clientRequestId, 2)),
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json<{ error: { code: string } }>()).error.code).toBe("IDEMPOTENCY_CONFLICT");

    const contributionKey = crypto.randomUUID();
    const complete = await SELF.fetch(`https://example.test/api/v1/readings/${operation.id}/contribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie!, "Idempotency-Key": contributionKey },
      body: JSON.stringify({ amountHkd: 0 }),
    });
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ status: "ready", readingId: operation.id });

    const result = await SELF.fetch(`https://example.test/api/v1/readings/${operation.id}`, { headers: { Cookie: cookie! } });
    const ready = await result.json<{ status: string; facts: { primary: { pattern: string }; cast: { changingPositions: number[] } }; takashimaInterpretations: unknown[] }>();
    expect(ready.status).toBe("ready");
    expect(ready.facts.primary.pattern).toBe("000111");
    expect(ready.facts.cast.changingPositions).toEqual([1]);
    expect(ready.takashimaInterpretations).toEqual([]);

    const identity = await env.DB.prepare("SELECT identity_key FROM reading_operations WHERE id = ?")
      .bind(operation.id).first<{ identity_key: string }>();
    const fallbackReflection = JSON.stringify({
      schemaVersion: "ai-reflection@1",
      summary: "Temporary fallback",
      perspective: "The provider timed out.",
      questionsToConsider: ["What can be retried?"],
      cautions: [],
      sourceRefs: [],
      grounding: { primaryPattern: "000111", relatingPattern: "000101", changingPositions: [1] },
    });
    const fallbackCreatedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE reading_operations SET reflection_json = ?, updated_at = ? WHERE id = ?")
        .bind(fallbackReflection, fallbackCreatedAt, operation.id),
      env.DB.prepare(`
        INSERT INTO ai_operations(
          id, reading_operation_id, identity_key, operation_kind, model_version, prompt_version,
          status, safety_outcome, input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at
        ) VALUES (?, ?, ?, 'reflection', 'deepseek-v4-flash', 'yi-reflection@3',
          'fallback', 'clear', 0, 0, 0, 20000, 'provider-timeout', ?)
      `).bind(crypto.randomUUID(), operation.id, identity!.identity_key, fallbackCreatedAt),
    ]);

    const retryableResult = await SELF.fetch(`https://example.test/api/v1/readings/${operation.id}`, { headers: { Cookie: cookie! } });
    expect((await retryableResult.json<{ reflection: unknown }>()).reflection).toBeNull();

    const successfulReflection = JSON.stringify({
      schemaVersion: "ai-reflection@1",
      summary: "Generated reflection",
      perspective: "A grounded reflection.",
      questionsToConsider: ["What is the next step?"],
      cautions: [],
      sourceRefs: [],
      grounding: { primaryPattern: "000111", relatingPattern: "000101", changingPositions: [1] },
    });
    await env.DB.batch([
      env.DB.prepare("UPDATE reading_operations SET reflection_json = ?, updated_at = ? WHERE id = ?")
        .bind(successfulReflection, fallbackCreatedAt + 1, operation.id),
      env.DB.prepare(`
        INSERT INTO ai_operations(
          id, reading_operation_id, identity_key, operation_kind, model_version, prompt_version,
          status, safety_outcome, input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at
        ) VALUES (?, ?, ?, 'reflection', 'deepseek-v4-flash', 'yi-reflection@3',
          'success', 'clear', 100, 200, 50, 42000, NULL, ?)
      `).bind(crypto.randomUUID(), operation.id, identity!.identity_key, fallbackCreatedAt + 1),
    ]);

    const cachedResult = await SELF.fetch(`https://example.test/api/v1/readings/${operation.id}`, { headers: { Cookie: cookie! } });
    expect((await cachedResult.json<{ reflection: { summary: string } }>()).reflection.summary).toBe("Generated reflection");

    const duplicateComplete = await SELF.fetch(`https://example.test/api/v1/readings/${operation.id}/contribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie!, "Idempotency-Key": contributionKey },
      body: JSON.stringify({ amountHkd: 0 }),
    });
    expect(duplicateComplete.status).toBe(200);
  });

  it("fails the source/AI release gate closed while deterministic service stays available", async () => {
    const response = await SELF.fetch("https://example.test/api/v1/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      deterministicReadings: true,
      catalogReviewed: false,
      aiEnabled: false,
      subscriptionsEnabled: false,
    });
  });
});

describe("Email/password account lifecycle", () => {
  it("verifies an address, resets the password once, and signs in with the replacement", async () => {
    const messages: Array<{ subject: string; text: string; from: { email: string }; replyTo: string }> = [];
    const pending: Promise<unknown>[] = [];
    const testEnv = {
      ...env,
      EMAIL: { send: async (message: typeof messages[number]) => { messages.push(message); } },
    } as unknown as Env;
    const auth = createAuth(testEnv, { waitUntil: (promise) => { pending.push(promise); } });
    const drainEmail = async () => { await Promise.all(pending.splice(0)); };
    const post = (path: string, body: unknown) => auth.handler(new Request(`${testEnv.APP_ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: testEnv.APP_ORIGIN, "X-Yi-Locale": "en", "CF-Connecting-IP": "192.0.2.1" },
      body: JSON.stringify(body),
    }));
    const email = `account-${crypto.randomUUID()}@example.test`;
    const originalPassword = "original-passphrase";
    const replacementPassword = "replacement-passphrase";

    const signup = await post("/sign-up/email", {
      name: "Acceptance Reader",
      email,
      password: originalPassword,
      callbackURL: `${testEnv.APP_ORIGIN}/auth?verified=1`,
    });
    expect(signup.status).toBe(200);
    await drainEmail();
    expect(messages.at(-1)).toMatchObject({ subject: "Verify your Yi account", from: { email: "no-reply@rich-tide.com" }, replyTo: "contact@rich-tide.com" });
    const verificationUrl = messages.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    expect(verificationUrl).toBeTruthy();

    const verify = await auth.handler(new Request(verificationUrl!, { redirect: "manual" }));
    expect(verify.status).toBe(302);
    expect(verify.headers.get("Location")).toBe(`${testEnv.APP_ORIGIN}/auth?verified=1`);
    await drainEmail();
    expect(messages.at(-1)).toMatchObject({ subject: "Welcome to Yi", from: { email: "hello@rich-tide.com" }, replyTo: "contact@rich-tide.com" });
    expect(await env.DB.prepare('SELECT emailVerified FROM "user" WHERE email = ?').bind(email).first()).toEqual({ emailVerified: 1 });

    const initialSignin = await post("/sign-in/email", { email, password: originalPassword });
    expect(initialSignin.status).toBe(200);
    expect(initialSignin.headers.get("Set-Cookie")).toContain("yi.session_token=");

    const resetRequest = await post("/request-password-reset", { email, redirectTo: `${testEnv.APP_ORIGIN}/auth` });
    expect(resetRequest.status).toBe(200);
    await drainEmail();
    expect(messages.at(-1)).toMatchObject({ subject: "Reset your Yi password", from: { email: "no-reply@rich-tide.com" }, replyTo: "contact@rich-tide.com" });
    const resetUrl = messages.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    expect(resetUrl).toBeTruthy();
    const resetRedirect = await auth.handler(new Request(resetUrl!, { redirect: "manual" }));
    expect(resetRedirect.status).toBe(302);
    const resetLocation = resetRedirect.headers.get("Location");
    expect(resetLocation).toMatch(new RegExp(`^${testEnv.APP_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/auth\\?token=`));
    const resetToken = new URL(resetLocation!).searchParams.get("token");
    expect(resetToken).toBeTruthy();

    const reset = await post("/reset-password", { newPassword: replacementPassword, token: resetToken });
    expect(reset.status).toBe(200);
    const replay = await post("/reset-password", { newPassword: replacementPassword, token: resetToken });
    expect(replay.status).toBe(400);
    expect((await post("/sign-in/email", { email, password: originalPassword })).status).toBe(401);
    expect((await post("/sign-in/email", { email, password: replacementPassword })).status).toBe(200);
  });
});

describe("D1 schema contracts", () => {
  it("rejects retired casting methods at the storage boundary", async () => {
    const now = Date.now();
    await expect(env.DB.prepare(`
      INSERT INTO reading_operations(
        id, client_request_id, identity_key, request_fingerprint, casting_method,
        question_kind, timezone, facts_json, safety_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'fingerprint', 'three-coin@1', 'none', 'UTC', '{}', '{}', 'ready', ?, ?)
    `).bind(crypto.randomUUID(), crypto.randomUUID(), `guest:${crypto.randomUUID()}`, now, now).run())
      .rejects.toThrow("Only three-number@1 casting is supported");
  });

  it("indexes archive titles, questions, facts, reflections and notes without cross-owner matches", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u1', 'One', 'one@example.test', 1, ?, ?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO user(id, name, email, emailVerified, createdAt, updatedAt) VALUES ('u2', 'Two', 'two@example.test', 1, ?, ?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO reading_operations(id, client_request_id, identity_key, user_id, request_fingerprint, casting_method, question_kind, timezone, facts_json, safety_json, status, created_at, updated_at) VALUES ('r1', '00000000-0000-4000-8000-000000000001', 'user:u1', 'u1', 'f1', 'three-number@1', 'none', 'UTC', '{}', '{}', 'ready', ?, ?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO reading_operations(id, client_request_id, identity_key, user_id, request_fingerprint, casting_method, question_kind, timezone, facts_json, safety_json, status, created_at, updated_at) VALUES ('r2', '00000000-0000-4000-8000-000000000002', 'user:u2', 'u2', 'f2', 'three-number@1', 'none', 'UTC', '{}', '{}', 'ready', ?, ?)`).bind(now, now),
    ]);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO archived_readings(id, user_id, reading_operation_id, title, facts_json, safety_json, created_at, updated_at) VALUES ('a1', 'u1', 'r1', 'orchid', '{}', '{}', ?, ?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO archived_readings(id, user_id, reading_operation_id, title, facts_json, safety_json, created_at, updated_at) VALUES ('a2', 'u2', 'r2', 'private orchid', '{}', '{}', ?, ?)`).bind(now, now),
    ]);
    await env.DB.prepare(`INSERT INTO notes(id, archive_id, user_id, body, created_at, updated_at) VALUES ('n1', 'a1', 'u1', 'reversible step', ?, ?)`).bind(now, now).run();
    const own = await env.DB.prepare(`SELECT archive_id FROM history_fts WHERE history_fts MATCH '"reversible"' AND user_id = 'u1'`).all<{ archive_id: string }>();
    const other = await env.DB.prepare(`SELECT archive_id FROM history_fts WHERE history_fts MATCH '"orchid"' AND user_id = 'u1'`).all<{ archive_id: string }>();
    expect(own.results.map((row) => row.archive_id)).toEqual(["a1"]);
    expect(other.results.map((row) => row.archive_id)).toEqual(["a1"]);
  });

  it("erases private reading content while retaining anonymized contribution metadata", async () => {
    const now = Date.now();
    const userId = crypto.randomUUID();
    const readingId = crypto.randomUUID();
    const archiveId = crypto.randomUUID();
    const contributionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user(id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'Reader', ?, 1, ?, ?)`).bind(userId, `${userId}@example.test`, now, now),
      env.DB.prepare(`INSERT INTO reading_operations(id, client_request_id, identity_key, user_id, request_fingerprint, casting_method, question_text, question_kind, timezone, facts_json, safety_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'f', 'three-number@1', 'private question', 'question', 'UTC', '{}', '{}', 'ready', ?, ?)`).bind(readingId, crypto.randomUUID(), `user:${userId}`, userId, now, now),
    ]);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO archived_readings(id, user_id, reading_operation_id, facts_json, safety_json, created_at, updated_at) VALUES (?, ?, ?, '{}', '{}', ?, ?)`).bind(archiveId, userId, readingId, now, now),
      env.DB.prepare(`INSERT INTO contributions(id, reading_operation_id, user_id, amount_hkd, status, created_at, updated_at) VALUES (?, ?, ?, 18, 'paid', ?, ?)`).bind(contributionId, readingId, userId, now, now),
    ]);
    await env.DB.batch([
      env.DB.prepare("UPDATE contributions SET user_id = NULL WHERE reading_operation_id = ? AND user_id = ?").bind(readingId, userId),
      env.DB.prepare("DELETE FROM reading_operations WHERE id = ? AND user_id = ?").bind(readingId, userId),
    ]);
    expect(await env.DB.prepare("SELECT id FROM archived_readings WHERE id = ?").bind(archiveId).first()).toBeNull();
    expect(await env.DB.prepare("SELECT reading_operation_id, user_id, amount_hkd, status FROM contributions WHERE id = ?").bind(contributionId).first()).toEqual({
      reading_operation_id: null,
      user_id: null,
      amount_hkd: 18,
      status: "paid",
    });
  });
});

async function stripeSignature(payload: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("whsec_yi_worker_tests"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const digest = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${digest}`;
}

async function seedPendingContribution() {
  const readingId = crypto.randomUUID();
  const contributionId = crypto.randomUUID();
  const checkoutId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO reading_operations(
      id, client_request_id, identity_key, request_fingerprint, casting_method, question_kind,
      timezone, facts_json, safety_json, contribution_amount_hkd, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'fingerprint', 'three-number@1', 'none', 'UTC', '{}', '{}', 18, 'payment_pending', ?, ?)
  `).bind(readingId, crypto.randomUUID(), `guest:${crypto.randomUUID()}`, now, now).run();
  await env.DB.prepare(`
    INSERT INTO contributions(id, reading_operation_id, amount_hkd, status, stripe_checkout_session_id, created_at, updated_at)
    VALUES (?, ?, 18, 'checkout_created', ?, ?, ?)
  `).bind(contributionId, readingId, checkoutId, now, now).run();
  return { readingId, contributionId, checkoutId };
}

function checkoutEvent(input: Awaited<ReturnType<typeof seedPendingContribution>>, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "event",
    api_version: "2026-06-30.basil",
    created: Math.floor(Date.now() / 1000),
    data: { object: {
      id: input.checkoutId,
      object: "checkout.session",
      amount_total: 1800,
      currency: "hkd",
      client_reference_id: input.readingId,
      metadata: { contribution_id: input.contributionId, reading_operation_id: input.readingId },
      payment_intent: "pi_yi_test",
      payment_status: "paid",
      ...overrides,
    } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  };
}

async function sendStripeEvent(event: ReturnType<typeof checkoutEvent>) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return SELF.fetch("https://example.test/api/v1/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": await stripeSignature(payload, timestamp) },
    body: payload,
  });
}

describe("Stripe webhook authority", () => {
  it("reveals a paid reading only after an exact signed webhook and handles replay", async () => {
    const input = await seedPendingContribution();
    const event = checkoutEvent(input);
    const first = await sendStripeEvent(event);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true, duplicate: false, eventType: "checkout.session.completed" });
    expect(await env.DB.prepare("SELECT status FROM reading_operations WHERE id = ?").bind(input.readingId).first()).toMatchObject({ status: "ready" });
    expect(await env.DB.prepare("SELECT status, stripe_payment_intent_id FROM contributions WHERE id = ?").bind(input.contributionId).first()).toMatchObject({ status: "paid", stripe_payment_intent_id: "pi_yi_test" });
    const replay = await sendStripeEvent(event);
    expect(await replay.json()).toMatchObject({ duplicate: true });
  });

  it("records but does not trust a mismatched amount", async () => {
    const input = await seedPendingContribution();
    const response = await sendStripeEvent(checkoutEvent(input, { amount_total: 800 }));
    expect(response.status).toBe(200);
    expect(await env.DB.prepare("SELECT status FROM reading_operations WHERE id = ?").bind(input.readingId).first()).toMatchObject({ status: "payment_pending" });
    expect(await env.DB.prepare("SELECT status FROM contributions WHERE id = ?").bind(input.contributionId).first()).toMatchObject({ status: "checkout_created" });
  });

  it("rejects an invalid signature", async () => {
    const response = await SELF.fetch("https://example.test/api/v1/webhooks/stripe", {
      method: "POST",
      headers: { "Stripe-Signature": "t=1,v1=invalid" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect((await response.json<{ error: { code: string } }>()).error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
  });
});

describe("Durable Object contracts", () => {
  it("upgrades an authenticated chat through the complete Worker route", async () => {
    const cookie = await createVerifiedSessionCookie();
    const createReading = await SELF.fetch("https://example.test/api/v1/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(readingBody()),
    });
    expect(createReading.status).toBe(201);
    const reading = await createReading.json<{ id: string }>();
    const completeReading = await SELF.fetch(`https://example.test/api/v1/readings/${reading.id}/contribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ amountHkd: 0 }),
    });
    expect(completeReading.status).toBe(200);

    const conversationId = crypto.randomUUID();
    const createChat = await SELF.fetch("https://example.test/api/v1/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": conversationId },
      body: JSON.stringify({
        readingId: reading.id,
        consent: true,
        includeReadingFacts: true,
        includeQuestion: false,
        includeSourceMaterial: false,
      }),
    });
    expect(createChat.status).toBe(201);

    const response = await SELF.fetch(`https://example.test/api/v1/chats/${conversationId}/socket`, {
      headers: { Cookie: cookie, Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close(1000, "test complete");
  });

  it("restores individual allowance after a provider failure", async () => {
    const coordinator = env.BUDGET.getByName(`failure-retry-${crypto.randomUUID()}`);
    const firstReservationId = crypto.randomUUID();
    expect(await coordinator.reserve({
      reservationId: firstReservationId, identityKey: "guest:retry", kind: "reflection", individualLimit: 1,
      estimatedTokens: 100, estimatedSpendMicros: 20, globalTokenLimit: 1_000, globalSpendMicrosLimit: 1_000,
      maxConcurrency: 1, enforceGlobal: true,
    })).toMatchObject({ ok: true, remaining: 0 });
    await coordinator.reconcile({ reservationId: firstReservationId, actualTokens: 0, actualSpendMicros: 0, outcome: "failure" });
    expect(await coordinator.reserve({
      reservationId: crypto.randomUUID(), identityKey: "guest:retry", kind: "reflection", individualLimit: 1,
      estimatedTokens: 100, estimatedSpendMicros: 20, globalTokenLimit: 1_000, globalSpendMicrosLimit: 1_000,
      maxConcurrency: 1, enforceGlobal: true,
    })).toMatchObject({ ok: true, remaining: 0 });
  });

  it("reserves daily quotas atomically and reconciles concurrency and actual usage", async () => {
    const coordinator = env.BUDGET.getByName(`test-${crypto.randomUUID()}`);
    const reservationId = crypto.randomUUID();
    const first = await coordinator.reserve({
      reservationId, identityKey: "guest:one", kind: "reflection", individualLimit: 1,
      estimatedTokens: 100, estimatedSpendMicros: 20, globalTokenLimit: 1_000, globalSpendMicrosLimit: 1_000,
      maxConcurrency: 1, enforceGlobal: true,
    });
    expect(first).toMatchObject({ ok: true, remaining: 0 });
    await coordinator.reconcile({ reservationId, actualTokens: 80, actualSpendMicros: 15, outcome: "success" });
    expect((await coordinator.snapshot()).global).toEqual({ tokens: 80, spend_micros: 15, concurrency: 0 });
    const second = await coordinator.reserve({
      reservationId: crypto.randomUUID(), identityKey: "guest:one", kind: "reflection", individualLimit: 1,
      estimatedTokens: 100, estimatedSpendMicros: 20, globalTokenLimit: 1_000, globalSpendMicrosLimit: 1_000,
      maxConcurrency: 1, enforceGlobal: true,
    });
    expect(second).toMatchObject({ ok: false, code: "INDIVIDUAL_LIMIT" });
  });

  it("keeps chat context immutable, owner-scoped, persistent, and individually erasable", async () => {
    const conversationId = crypto.randomUUID();
    const ownerId = crypto.randomUUID();
    const facts = deriveReadingFacts(readingCreateSchema.parse(readingBody()));
    const context = { facts, reflection: null, question: { kind: "withheld" as const }, sources: [], locale: "en" as const, safetyRouted: false };
    const chat = env.CHAT.getByName(conversationId);
    const archiveId = crypto.randomUUID();
    expect(await chat.initialize({ conversationId, ownerId, archiveId, contextHash: "immutable-a", context })).toEqual({ ok: true });
    expect(await chat.list(ownerId, 0)).toEqual([]);
    expect(await chat.initialize({ conversationId, ownerId, archiveId, contextHash: "immutable-b", context })).toEqual({ ok: false, code: "CHAT_CONTEXT_CONFLICT" });
    const forbidden = await chat.fetch(new Request("https://chat.test", { headers: { "X-Yi-Owner-Id": crypto.randomUUID() } }));
    expect(forbidden.status).toBe(403);
    await chat.erase(ownerId);
    const erased = await chat.fetch(new Request("https://chat.test", { headers: { "X-Yi-Owner-Id": ownerId } }));
    expect(erased.status).toBe(403);
  });
});
