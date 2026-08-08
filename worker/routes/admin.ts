import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, Env } from "../env";
import { requireAdmin } from "../lib/auth";
import { sha256 } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { parseJson } from "../lib/http";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

routes.use("*", async (c, next) => {
  await requireAdmin(c);
  c.header("Cache-Control", "private, no-store");
  await next();
});

routes.get("/summary", async (c) => {
  const [users, readings, contributions, ai] = await Promise.all([
    c.env.DB.prepare("SELECT count(*) AS total, sum(CASE WHEN p.status = 'suspended' THEN 1 ELSE 0 END) AS suspended FROM user u JOIN profiles p ON p.user_id = u.id").first(),
    c.env.DB.prepare("SELECT count(*) AS total, sum(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready FROM reading_operations").first(),
    c.env.DB.prepare("SELECT count(*) AS total, coalesce(sum(CASE WHEN status = 'paid' THEN amount_hkd ELSE 0 END), 0) AS paid_hkd FROM contributions").first(),
    c.env.DB.prepare(`
      SELECT count(*) AS operations, coalesce(sum(spend_micros), 0) AS spend_micros,
             coalesce(sum(input_tokens + output_tokens), 0) AS tokens,
             coalesce(avg(latency_ms), 0) AS average_latency_ms,
             sum(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) AS fallbacks
      FROM ai_operations WHERE created_at >= ?
    `).bind(Date.now() - 24 * 60 * 60 * 1000).first(),
  ]);
  let liveBudget: unknown = null;
  try { liveBudget = await c.env.BUDGET.getByName(new Date().toISOString().slice(0, 10)).snapshot(); } catch { liveBudget = { unavailable: true }; }
  return c.json({ schemaVersion: "admin-summary@1", users, readings, contributions, aiLast24Hours: ai, liveBudget });
});

routes.get("/users", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.emailVerified, u.createdAt, p.role, p.status, p.locale
    FROM user u JOIN profiles p ON p.user_id = u.id ORDER BY u.createdAt DESC LIMIT 200
  `).all();
  return c.json({ schemaVersion: "admin-users@1", items: rows.results });
});

routes.patch("/users/:id/status", async (c) => {
  const admin = await requireAdmin(c);
  const body = await parseJson(c, z.object({ status: z.enum(["active", "suspended"]) }).strict());
  if (admin.user.id === c.req.param("id") && body.status === "suspended") throw new ApiError("SELF_SUSPEND_FORBIDDEN", 409, "You cannot suspend your own account.");
  const result = await c.env.DB.prepare("UPDATE profiles SET status = ?, updated_at = ? WHERE user_id = ?")
    .bind(body.status, Date.now(), c.req.param("id")).run();
  if (!result.meta.changes) throw new ApiError("USER_NOT_FOUND", 404, "User not found.");
  await c.env.DB.prepare("INSERT INTO audit_events(id, actor_user_id, action, target_type, target_id_hash, metadata_json, created_at) VALUES (?, ?, 'account-status-change', 'user', ?, ?, ?)")
    .bind(crypto.randomUUID(), admin.user.id, await sha256(c.req.param("id")), JSON.stringify({ status: body.status }), Date.now()).run();
  return c.json({ schemaVersion: "admin-user@1", updated: true });
});

routes.get("/readings", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, user_id, casting_method, status, contribution_amount_hkd, prompt_version, model_version,
           json_extract(facts_json, '$.identifierCatalogVersion') AS catalog_version,
           json_extract(source_snapshot_json, '$[0].releaseId') AS source_release_id,
           json_extract(facts_json, '$.sourceStatus') AS source_status,
           json_extract(safety_json, '$.routed') AS safety_routed,
           json_extract(safety_json, '$.categories') AS safety_categories,
           created_at, updated_at
    FROM reading_operations ORDER BY created_at DESC LIMIT 200
  `).all();
  return c.json({ schemaVersion: "admin-readings@1", items: rows.results });
});

routes.get("/contributions", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, reading_operation_id, amount_hkd, status, stripe_checkout_session_id, stripe_payment_intent_id,
           paid_at, refunded_at, created_at, updated_at
    FROM contributions ORDER BY created_at DESC LIMIT 200
  `).all<Record<string, unknown>>();
  return c.json({ schemaVersion: "admin-contributions@1", items: rows.results.map((row) => ({
    ...row,
    stripeDashboardMode: c.env.APP_ENV === "production" ? "live" : "test",
    stripeDashboardUrl: typeof row.stripe_payment_intent_id === "string"
      ? `https://dashboard.stripe.com/${c.env.APP_ENV === "production" ? "" : "test/"}payments/${encodeURIComponent(row.stripe_payment_intent_id)}`
      : typeof row.stripe_checkout_session_id === "string"
        ? `https://dashboard.stripe.com/${c.env.APP_ENV === "production" ? "" : "test/"}search?query=${encodeURIComponent(row.stripe_checkout_session_id)}`
        : null,
  })) });
});

routes.get("/ai", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, reading_operation_id, operation_kind, model_version, prompt_version, status, safety_outcome,
           input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at
    FROM ai_operations ORDER BY created_at DESC LIMIT 500
  `).all();
  return c.json({ schemaVersion: "admin-ai@1", items: rows.results });
});

routes.get("/errors", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, request_id, method, path, error_code, status_code, retryable, created_at
    FROM operational_errors ORDER BY created_at DESC LIMIT 500
  `).all();
  return c.json({ schemaVersion: "admin-errors@1", items: rows.results });
});

routes.get("/config", async (c) => {
  const rows = await c.env.DB.prepare("SELECT key, value, updated_at FROM app_config ORDER BY key").all();
  return c.json({ schemaVersion: "admin-config@1", items: rows.results });
});

routes.patch("/config", async (c) => {
  const admin = await requireAdmin(c);
  const body = await parseJson(c, z.object({
    globalAiEnabled: z.boolean(),
    globalDailyTokenBudget: z.number().int().min(1).max(100_000_000),
    globalDailySpendMicros: z.number().int().min(1).max(1_000_000_000),
    globalAiMaxConcurrency: z.number().int().min(1).max(1_000),
  }).strict());
  const now = Date.now();
  const values: Array<[string, string]> = [
    ["global_ai_enabled", String(body.globalAiEnabled)],
    ["global_daily_token_budget", String(body.globalDailyTokenBudget)],
    ["global_daily_spend_micros", String(body.globalDailySpendMicros)],
    ["global_ai_max_concurrency", String(body.globalAiMaxConcurrency)],
  ];
  await c.env.DB.batch(values.map(([key, value]) => c.env.DB.prepare(`
    INSERT INTO app_config(key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).bind(key, value, admin.user.id, now)));
  await c.env.DB.prepare("INSERT INTO audit_events(id, actor_user_id, action, target_type, metadata_json, created_at) VALUES (?, ?, 'ai-config-change', 'app_config', ?, ?)")
    .bind(crypto.randomUUID(), admin.user.id, JSON.stringify(body), now).run();
  return c.json({ schemaVersion: "admin-config@1", updated: true });
});

export default routes;
