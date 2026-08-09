import { Hono } from "hono";
import { z } from "zod";
import type { CastFacts } from "../../shared/casting";
import type { ReadingQuestion } from "../../shared/contracts";
import type { AppVariables, Env } from "../env";
import { requireSession } from "../lib/auth";
import { isProviderEnabled } from "../lib/ai-config";
import { canonicalFingerprint } from "../lib/crypto";
import type { AiReflection, ChatContext } from "../lib/deepseek";
import { ApiError } from "../lib/errors";
import { parseJson, requestLocale } from "../lib/http";
import { archiveReading, ownedReading, type ReadingRow } from "../lib/readings";
import { localizedSourceSnapshot } from "../lib/source-catalog";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const startSchema = z.object({
  readingId: z.string().uuid(),
  title: z.string().trim().max(120).optional(),
  consent: z.literal(true),
  includeReadingFacts: z.literal(true),
  includeQuestion: z.boolean(),
  includeSourceMaterial: z.boolean(),
}).strict();

async function ownedConversation(env: Env, id: string, userId: string) {
  const conversation = await env.DB.prepare("SELECT id, archive_id, reading_context_hash, created_at, updated_at FROM chat_conversations WHERE id = ? AND user_id = ?")
    .bind(id, userId).first<{ id: string; archive_id: string; reading_context_hash: string; created_at: number; updated_at: number }>();
  if (!conversation) throw new ApiError("CHAT_NOT_FOUND", 404, "Conversation not found.");
  return conversation;
}

routes.get("/", async (c) => {
  const session = await requireSession(c);
  const rows = await c.env.DB.prepare(`
    SELECT cc.id, cc.archive_id, cc.created_at, cc.updated_at, ar.title
    FROM chat_conversations cc JOIN archived_readings ar ON ar.id = cc.archive_id
    WHERE cc.user_id = ? ORDER BY cc.updated_at DESC LIMIT 100
  `).bind(session.user.id).all<{ id: string; archive_id: string; title: string | null; created_at: number; updated_at: number }>();
  return c.json({ schemaVersion: "chat-list@1", items: rows.results.map((row) => ({
    id: row.id,
    archiveId: row.archive_id,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  })) });
});

routes.post("/", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, startSchema);
  const conversationId = c.req.header("Idempotency-Key");
  if (!conversationId || !z.string().uuid().safeParse(conversationId).success) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", 400, "A cryptographic UUID Idempotency-Key header is required.");
  }
  const requestFingerprint = await canonicalFingerprint(body);
  const existing = await c.env.DB.prepare("SELECT id, archive_id, request_fingerprint FROM chat_conversations WHERE id = ? AND user_id = ?")
    .bind(conversationId, session.user.id).first<{ id: string; archive_id: string; request_fingerprint: string | null }>();
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", 409, "This idempotency key was already used for another chat.");
    return c.json({ schemaVersion: "chat@1", id: existing.id, archiveId: existing.archive_id, cached: true });
  }

  const identity = { kind: "user" as const, key: `user:${session.user.id}`, userId: session.user.id, guestIdHash: null };
  const reading = await ownedReading(c, body.readingId, identity);
  const archiveId = await archiveReading(c.env, { userId: session.user.id, reading, title: body.title });
  const fullReading = await c.env.DB.prepare("SELECT * FROM reading_operations WHERE id = ? AND user_id = ?")
    .bind(reading.id, session.user.id).first<ReadingRow>();
  if (!fullReading) throw new ApiError("READING_NOT_FOUND", 404, "Reading not found.");
  const safety = JSON.parse(fullReading.safety_json) as { routed?: boolean };
  const question: ReadingQuestion | { kind: "withheld" } = body.includeQuestion
    ? fullReading.question_kind === "question" && fullReading.question_text
      ? { kind: "question", text: fullReading.question_text }
      : { kind: "none" }
    : { kind: "withheld" };
  const sources = await localizedSourceSnapshot(c.env, fullReading.source_snapshot_json, body.includeSourceMaterial, requestLocale(c));
  const context: ChatContext = {
    facts: JSON.parse(fullReading.facts_json) as CastFacts,
    reflection: fullReading.reflection_json ? JSON.parse(fullReading.reflection_json) as AiReflection : null,
    question,
    sources,
    locale: requestLocale(c),
    safetyRouted: safety.routed === true,
  };
  const contextHash = await canonicalFingerprint(context);
  const now = Date.now();
  await c.env.DB.prepare(`
    INSERT INTO chat_conversations(id, user_id, archive_id, reading_context_hash, request_fingerprint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(conversationId, session.user.id, archiveId, contextHash, requestFingerprint, now, now).run();
  try {
    const initialized = await c.env.CHAT.getByName(conversationId).initialize({ conversationId, ownerId: session.user.id, archiveId, contextHash, context });
    if (!initialized.ok) throw new Error(initialized.code);
  } catch {
    await c.env.DB.prepare("DELETE FROM chat_conversations WHERE id = ? AND user_id = ?").bind(conversationId, session.user.id).run();
    throw new ApiError("CHAT_INITIALIZE_FAILED", 503, "Conversation could not be initialized.", true);
  }
  await c.env.DB.prepare(`
    UPDATE reading_operations
    SET ai_consent_granted = 1, ai_consent_included_question = ?, ai_consent_included_source_material = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(question.kind === "question" ? 1 : 0, sources.length > 0 ? 1 : 0, Date.now(), reading.id, session.user.id).run();
  return c.json({ schemaVersion: "chat@1", id: conversationId, archiveId }, 201);
});

routes.get("/:id/messages", async (c) => {
  const session = await requireSession(c);
  await ownedConversation(c.env, c.req.param("id"), session.user.id);
  const after = Number(c.req.query("after") ?? 0);
  const messages = await c.env.CHAT.getByName(c.req.param("id")).list(session.user.id, Number.isSafeInteger(after) ? after : 0);
  return c.json({ schemaVersion: "chat-messages@1", messages });
});

routes.get("/:id/socket", async (c) => {
  const session = await requireSession(c);
  await ownedConversation(c.env, c.req.param("id"), session.user.id);
  const headers = new Headers(c.req.raw.headers);
  headers.delete("X-Yi-Owner-Id");
  headers.set("X-Yi-Owner-Id", session.user.id);
  const internalRequest = new Request(c.req.url, { method: "GET", headers });
  return c.env.CHAT.getByName(c.req.param("id")).fetch(internalRequest);
});

routes.delete("/:id", async (c) => {
  const session = await requireSession(c);
  await ownedConversation(c.env, c.req.param("id"), session.user.id);
  await c.env.CHAT.getByName(c.req.param("id")).erase(session.user.id);
  await c.env.DB.prepare("DELETE FROM chat_conversations WHERE id = ? AND user_id = ?").bind(c.req.param("id"), session.user.id).run();
  return c.body(null, 204);
});

export default routes;
