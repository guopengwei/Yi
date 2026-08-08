import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, Env } from "../env";
import { requireSession } from "../lib/auth";
import { ApiError } from "../lib/errors";
import { parseJson } from "../lib/http";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface ArchiveSummary {
  id: string;
  title: string | null;
  question_text: string | null;
  facts_json: string;
  reflection_json: string | null;
  reflection_included_question: number;
  safety_json: string;
  created_at: number;
  updated_at: number;
}

function presentArchive(row: ArchiveSummary) {
  return {
    id: row.id,
    title: row.title,
    question: row.question_text,
    facts: JSON.parse(row.facts_json) as unknown,
    reflection: row.reflection_json ? JSON.parse(row.reflection_json) as unknown : null,
    reflectionShareEligible: Boolean(row.reflection_json) && row.reflection_included_question !== 1,
    safety: JSON.parse(row.safety_json) as unknown,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

routes.get("/", async (c) => {
  const session = await requireSession(c);
  const cursor = Number(c.req.query("cursor") ?? Number.MAX_SAFE_INTEGER);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const result = await c.env.DB.prepare(`
    SELECT id, title, question_text, facts_json, reflection_json, reflection_included_question, safety_json, created_at, updated_at
    FROM archived_readings WHERE user_id = ? AND created_at < ?
    ORDER BY created_at DESC LIMIT ?
  `).bind(session.user.id, Number.isSafeInteger(cursor) ? cursor : Number.MAX_SAFE_INTEGER, limit + 1).all<ArchiveSummary>();
  const rows = result.results.slice(0, limit);
  return c.json({
    schemaVersion: "history-page@1",
    items: rows.map(presentArchive),
    nextCursor: result.results.length > limit ? rows.at(-1)?.created_at ?? null : null,
  });
});

routes.get("/search", async (c) => {
  const session = await requireSession(c);
  const query = (c.req.query("q") ?? "").trim();
  if (!query || query.length > 120) throw new ApiError("INVALID_SEARCH", 422, "Search must contain 1–120 characters.");
  // Quoting each token avoids exposing FTS5 operators and syntax errors.
  const ftsQuery = query.split(/\s+/).filter(Boolean).slice(0, 12).map((token) => `"${token.replace(/"/g, '""')}"`).join(" AND ");
  const result = await c.env.DB.prepare(`
    SELECT ar.id, ar.title, ar.question_text, ar.facts_json, ar.reflection_json, ar.reflection_included_question, ar.safety_json, ar.created_at, ar.updated_at,
           bm25(history_fts) AS rank
    FROM history_fts JOIN archived_readings ar ON ar.id = history_fts.archive_id
    WHERE history_fts MATCH ? AND history_fts.user_id = ?
    ORDER BY rank LIMIT 50
  `).bind(ftsQuery, session.user.id).all<ArchiveSummary & { rank: number }>();
  return c.json({ schemaVersion: "history-search@1", items: result.results.map(presentArchive) });
});

routes.get("/:id", async (c) => {
  const session = await requireSession(c);
  const archive = await c.env.DB.prepare(`
    SELECT id, title, question_text, facts_json, reflection_json, reflection_included_question, safety_json, created_at, updated_at
    FROM archived_readings WHERE id = ? AND user_id = ?
  `).bind(c.req.param("id"), session.user.id).first<ArchiveSummary>();
  if (!archive) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  const notes = await c.env.DB.prepare(`
    SELECT id, body, created_at, updated_at FROM notes WHERE archive_id = ? AND user_id = ? ORDER BY updated_at DESC
  `).bind(archive.id, session.user.id).all<{ id: string; body: string; created_at: number; updated_at: number }>();
  return c.json({
    schemaVersion: "archive@1",
    ...presentArchive(archive),
    notes: notes.results.map((note) => ({ id: note.id, body: note.body, createdAt: new Date(note.created_at).toISOString(), updatedAt: new Date(note.updated_at).toISOString() })),
  });
});

routes.patch("/:id", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({ title: z.string().trim().max(120).nullable() }).strict());
  const result = await c.env.DB.prepare("UPDATE archived_readings SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(body.title || null, Date.now(), c.req.param("id"), session.user.id).run();
  if (!result.meta.changes) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  return c.json({ schemaVersion: "archive@1", updated: true });
});

routes.delete("/:id", async (c) => {
  const session = await requireSession(c);
  const archive = await c.env.DB.prepare("SELECT reading_operation_id FROM archived_readings WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), session.user.id).first<{ reading_operation_id: string }>();
  if (!archive) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  const conversations = await c.env.DB.prepare("SELECT id FROM chat_conversations WHERE archive_id = ? AND user_id = ?")
    .bind(c.req.param("id"), session.user.id).all<{ id: string }>();
  for (const conversation of conversations.results) {
    await c.env.CHAT.getByName(conversation.id).erase(session.user.id);
  }
  const deletion = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE contributions SET user_id = NULL WHERE reading_operation_id = ? AND user_id = ?")
      .bind(archive.reading_operation_id, session.user.id),
    c.env.DB.prepare("DELETE FROM reading_operations WHERE id = ? AND user_id = ?")
      .bind(archive.reading_operation_id, session.user.id),
  ]);
  const result = deletion[1];
  if (!result) throw new ApiError("ARCHIVE_DELETE_FAILED", 503, "Saved reading could not be deleted.", true);
  if (!result.meta.changes) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  return c.body(null, 204);
});

routes.post("/:id/notes", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({ body: z.string().trim().min(1).max(10_000) }).strict());
  const archive = await c.env.DB.prepare("SELECT id FROM archived_readings WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), session.user.id).first();
  if (!archive) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO notes(id, archive_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, c.req.param("id"), session.user.id, body.body, now, now).run();
  return c.json({ schemaVersion: "note@1", id, body: body.body, createdAt: new Date(now).toISOString() }, 201);
});

routes.patch("/:archiveId/notes/:noteId", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({ body: z.string().trim().min(1).max(10_000) }).strict());
  const result = await c.env.DB.prepare("UPDATE notes SET body = ?, updated_at = ? WHERE id = ? AND archive_id = ? AND user_id = ?")
    .bind(body.body, Date.now(), c.req.param("noteId"), c.req.param("archiveId"), session.user.id).run();
  if (!result.meta.changes) throw new ApiError("NOTE_NOT_FOUND", 404, "Note not found.");
  return c.json({ schemaVersion: "note@1", updated: true });
});

routes.delete("/:archiveId/notes/:noteId", async (c) => {
  const session = await requireSession(c);
  const result = await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND archive_id = ? AND user_id = ?")
    .bind(c.req.param("noteId"), c.req.param("archiveId"), session.user.id).run();
  if (!result.meta.changes) throw new ApiError("NOTE_NOT_FOUND", 404, "Note not found.");
  return c.body(null, 204);
});

export default routes;
