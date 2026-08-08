import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, Env } from "../env";
import { requireSession } from "../lib/auth";
import { randomToken, sha256 } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { parseJson } from "../lib/http";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

routes.post("/", async (c) => {
  const session = await requireSession(c);
  const body = await parseJson(c, z.object({
    archiveId: z.string().uuid(),
    includeReflection: z.boolean(),
  }).strict());
  const archive = await c.env.DB.prepare(`
    SELECT facts_json, reflection_json, reflection_included_question FROM archived_readings WHERE id = ? AND user_id = ?
  `).bind(body.archiveId, session.user.id).first<{ facts_json: string; reflection_json: string | null; reflection_included_question: number }>();
  if (!archive) throw new ApiError("ARCHIVE_NOT_FOUND", 404, "Saved reading not found.");
  if (body.includeReflection && archive.reflection_included_question === 1) {
    throw new ApiError("REFLECTION_NOT_SHAREABLE", 409, "This reflection used your private question and cannot be included in an anonymous share.");
  }
  const token = randomToken(32);
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  const snapshot = {
    schemaVersion: "share-snapshot@1",
    facts: JSON.parse(archive.facts_json) as unknown,
    reflection: body.includeReflection && archive.reflection_json ? JSON.parse(archive.reflection_json) as unknown : null,
  };
  await c.env.DB.prepare(`
    INSERT INTO share_snapshots(id, owner_user_id, archive_id, token_hash, snapshot_json, include_reflection, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, session.user.id, body.archiveId, await sha256(token), JSON.stringify(snapshot), body.includeReflection ? 1 : 0, now, expiresAt).run();
  return c.json({
    schemaVersion: "share@1",
    id,
    url: `${c.env.APP_ORIGIN}/share/${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  }, 201);
});

routes.get("/", async (c) => {
  const session = await requireSession(c);
  const rows = await c.env.DB.prepare(`
    SELECT id, archive_id, include_reflection, created_at, expires_at, revoked_at
    FROM share_snapshots WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 100
  `).bind(session.user.id).all<{ id: string; archive_id: string; include_reflection: number; created_at: number; expires_at: number; revoked_at: number | null }>();
  return c.json({ schemaVersion: "share-list@1", items: rows.results.map((row) => ({
    id: row.id,
    archiveId: row.archive_id,
    includeReflection: row.include_reflection === 1,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  })) });
});

routes.delete("/:id", async (c) => {
  const session = await requireSession(c);
  const result = await c.env.DB.prepare("UPDATE share_snapshots SET revoked_at = ? WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL")
    .bind(Date.now(), c.req.param("id"), session.user.id).run();
  if (!result.meta.changes) throw new ApiError("SHARE_NOT_FOUND", 404, "Share link not found.");
  return c.body(null, 204);
});

routes.get("/public/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new ApiError("SHARE_NOT_FOUND", 404, "Share link not found.");
  const row = await c.env.DB.prepare(`
    SELECT snapshot_json, expires_at FROM share_snapshots
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  `).bind(await sha256(token), Date.now()).first<{ snapshot_json: string; expires_at: number }>();
  if (!row) throw new ApiError("SHARE_NOT_FOUND", 404, "Share link not found.");
  c.header("Cache-Control", "private, no-store");
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  return c.json({
    ...(JSON.parse(row.snapshot_json) as Record<string, unknown>),
    expiresAt: new Date(row.expires_at).toISOString(),
  });
});

export default routes;
