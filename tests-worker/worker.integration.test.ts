import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";

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
    const ready = await result.json<{ status: string; facts: { primary: { pattern: string }; cast: { changingPositions: number[] } } }>();
    expect(ready.status).toBe("ready");
    expect(ready.facts.primary.pattern).toBe("000111");
    expect(ready.facts.cast.changingPositions).toEqual([1]);

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

describe("D1 schema contracts", () => {
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
