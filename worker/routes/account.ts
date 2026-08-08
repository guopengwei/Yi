import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, Env } from "../env";
import { requireSession } from "../lib/auth";
import { ApiError } from "../lib/errors";
import { parseJson } from "../lib/http";
import { guestIdentity } from "../lib/identity";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

routes.get("/profile", async (c) => {
  const session = await requireSession(c);
  const profile = await c.env.DB.prepare(`
    SELECT role, status, locale, font_size, theme, created_at, updated_at FROM profiles WHERE user_id = ?
  `).bind(session.user.id).first<{ role: string; status: string; locale: string; font_size: string; theme: string; created_at: number; updated_at: number }>();
  if (!profile) throw new ApiError("PROFILE_NOT_FOUND", 404, "Profile not found.");
  return c.json({
    schemaVersion: "profile@1",
    user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image, emailVerified: session.user.emailVerified },
    profile: { role: profile.role, status: profile.status, locale: profile.locale, fontSize: profile.font_size, theme: profile.theme },
  });
});

routes.patch("/settings", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({
    locale: z.enum(["zh-HK", "zh-CN", "en"]),
    fontSize: z.enum(["small", "medium", "large"]),
    theme: z.enum(["light", "dark", "system"]),
  }).strict());
  await c.env.DB.prepare("UPDATE profiles SET locale = ?, font_size = ?, theme = ?, updated_at = ? WHERE user_id = ?")
    .bind(body.locale, body.fontSize, body.theme, Date.now(), session.user.id).run();
  return c.json({ schemaVersion: "settings@1", ...body });
});

routes.post("/claim-guest", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({ locale: z.enum(["zh-HK", "zh-CN", "en"]).optional() }).strict());
  if (body.locale) {
    await c.env.DB.prepare("UPDATE profiles SET locale = ?, updated_at = ? WHERE user_id = ?")
      .bind(body.locale, Date.now(), session.user.id).run();
  }
  const guest = await guestIdentity(c);
  const readings = await c.env.DB.prepare(`
    SELECT id FROM reading_operations WHERE identity_key = ? AND user_id IS NULL AND expires_at > ?
  `).bind(guest.key, Date.now()).all<{ id: string }>();
  let claimed = 0;
  for (const reading of readings.results) {
    const result = await c.env.DB.prepare(`
      UPDATE OR IGNORE reading_operations
      SET identity_key = ?, user_id = ?, guest_id_hash = NULL, expires_at = NULL, updated_at = ?
      WHERE id = ? AND identity_key = ? AND user_id IS NULL
    `).bind(`user:${session.user.id}`, session.user.id, Date.now(), reading.id, guest.key).run();
    if (result.meta.changes) {
      claimed += 1;
      await c.env.DB.prepare("UPDATE contributions SET user_id = ? WHERE reading_operation_id = ? AND user_id IS NULL")
        .bind(session.user.id, reading.id).run();
    }
  }
  return c.json({ schemaVersion: "guest-claim@1", claimed });
});

routes.get("/export", async (c) => {
  const session = await requireSession(c);
  const exportId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO account_exports(id, user_id, status, created_at, expires_at) VALUES (?, ?, 'building', ?, ?)")
    .bind(exportId, session.user.id, now, now + 24 * 60 * 60 * 1000).run();
  const [profile, readings, archives, notes, contributions, shares, conversations, aiOperations, contacts] = await Promise.all([
    c.env.DB.prepare("SELECT role, status, locale, font_size, theme, created_at, updated_at FROM profiles WHERE user_id = ?").bind(session.user.id).first(),
    c.env.DB.prepare(`SELECT id, casting_method, question_text, question_kind, timezone, facts_json, reflection_json, source_snapshot_json,
      safety_json, contribution_amount_hkd, status, prompt_version, model_version, created_at, updated_at, expires_at
      FROM reading_operations WHERE user_id = ? ORDER BY created_at`).bind(session.user.id).all(),
    c.env.DB.prepare("SELECT * FROM archived_readings WHERE user_id = ? ORDER BY created_at").bind(session.user.id).all(),
    c.env.DB.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at").bind(session.user.id).all(),
    c.env.DB.prepare("SELECT id, reading_operation_id, amount_hkd, status, paid_at, refunded_at, created_at, updated_at FROM contributions WHERE user_id = ? ORDER BY created_at").bind(session.user.id).all(),
    c.env.DB.prepare("SELECT id, archive_id, include_reflection, created_at, expires_at, revoked_at FROM share_snapshots WHERE owner_user_id = ? ORDER BY created_at").bind(session.user.id).all(),
    c.env.DB.prepare("SELECT id, archive_id, created_at, updated_at FROM chat_conversations WHERE user_id = ? ORDER BY created_at").bind(session.user.id).all<{ id: string; archive_id: string; created_at: number; updated_at: number }>(),
    c.env.DB.prepare(`SELECT id, reading_operation_id, operation_kind, model_version, prompt_version, status, safety_outcome,
      input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at FROM ai_operations WHERE user_id = ? ORDER BY created_at`).bind(session.user.id).all(),
    c.env.DB.prepare("SELECT id, email, locale, subject, message, status, created_at FROM contact_submissions WHERE user_id = ? ORDER BY created_at").bind(session.user.id).all(),
  ]);
  const chats: Array<Record<string, unknown>> = [];
  for (const conversation of conversations.results) {
    const messages: unknown[] = [];
    let after = 0;
    while (true) {
      const page = await c.env.CHAT.getByName(conversation.id).list(session.user.id, after);
      messages.push(...page);
      if (page.length < 200) break;
      after = page.at(-1)?.seq ?? after;
    }
    chats.push({ ...conversation, messages });
  }
  const payload = {
    schemaVersion: "account-export@1",
    exportedAt: new Date().toISOString(),
    user: { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified, image: session.user.image },
    profile,
    readingOperations: readings.results,
    archivedReadings: archives.results,
    notes: notes.results,
    contributions: contributions.results,
    shares: shares.results,
    chats,
    aiOperations: aiOperations.results,
    contactSubmissions: contacts.results,
  };
  await c.env.DB.prepare("UPDATE account_exports SET status = 'complete' WHERE id = ? AND user_id = ?").bind(exportId, session.user.id).run();
  c.header("Content-Disposition", `attachment; filename="yi-account-export-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Cache-Control", "private, no-store");
  return c.body(JSON.stringify(payload, null, 2));
});

export default routes;
