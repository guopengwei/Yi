import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppVariables, Env } from "./env";
import { createAuth } from "./lib/auth";
import { isProviderEnabled } from "./lib/ai-config";
import { ApiError, errorResponse, redactForLog } from "./lib/errors";
import { clientIp } from "./lib/http";
import { handleStripeWebhook } from "./lib/payments";
import { enforceRateLimit } from "./lib/rate-limit";
import { verifyTurnstile } from "./lib/turnstile";
import accountRoutes from "./routes/account";
import adminRoutes from "./routes/admin";
import chatRoutes from "./routes/chats";
import contactRoutes from "./routes/contact";
import historyRoutes from "./routes/history";
import readingRoutes from "./routes/readings";
import shareRoutes from "./routes/shares";

export { BudgetCoordinator } from "./durable/BudgetCoordinator";
export { ReadingChat } from "./durable/ReadingChat";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", async (c, next) => {
  c.set("requestId", c.req.header("CF-Ray") || crypto.randomUUID());
  await next();
  c.header("X-Request-Id", c.get("requestId"));
});

app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://cloudflareinsights.com", "wss:"],
    frameSrc: ["https://challenges.cloudflare.com"],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: "strict-origin",
  crossOriginOpenerPolicy: "same-origin",
}));

app.post("/api/v1/webhooks/stripe", async (c) => {
  const result = await handleStripeWebhook(c.env, c.req.raw);
  return c.json({ received: true, ...result });
});

app.use("/api/auth/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const path = new URL(c.req.url).pathname.replace(/^\/api\/auth/, "");
  const action = path === "/sign-up/email" ? "signup" : path === "/request-password-reset" ? "password_recovery" : null;
  if (!action) return next();
  await enforceRateLimit(c.env, { bucket: action, identity: clientIp(c), limit: action === "signup" ? 8 : 5, windowMs: 60 * 60 * 1000 });
  await verifyTurnstile(c.env, {
    token: c.req.header("X-Turnstile-Token"),
    action,
    remoteIp: clientIp(c),
    idempotencyKey: crypto.randomUUID(),
  });
  return next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env, c.executionCtx).handler(c.req.raw));

app.get("/api/v1/status", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    schemaVersion: "service-status@1",
    environment: c.env.APP_ENV,
    deterministicReadings: true,
    aiEnabled: await isProviderEnabled(c.env),
    catalogReviewed: c.env.CATALOG_REVIEWED === "true",
    emailPasswordEnabled: Boolean(c.env.BETTER_AUTH_SECRET),
    googleAuthEnabled: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    microsoftAuthEnabled: Boolean(c.env.MICROSOFT_CLIENT_ID && c.env.MICROSOFT_CLIENT_SECRET),
    paymentsEnabled: Boolean(c.env.STRIPE_SECRET_KEY && c.env.STRIPE_WEBHOOK_SECRET),
    subscriptionsEnabled: false,
  });
});

app.route("/api/v1/readings", readingRoutes);
app.route("/api/v1/history", historyRoutes);
app.route("/api/v1/chats", chatRoutes);
app.route("/api/v1/shares", shareRoutes);
app.route("/api/v1/account", accountRoutes);
app.route("/api/v1/contact", contactRoutes);
app.route("/api/v1/admin", adminRoutes);

app.notFound(async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith("/api/")) return errorResponse(c, new ApiError("NOT_FOUND", 404, "Endpoint not found."));
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  if (!(error instanceof ApiError)) {
    console.error(JSON.stringify(redactForLog({
      level: "error",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      error: error instanceof Error ? { name: error.name, message: error.message } : { name: "unknown" },
    })));
  }
  const operational = error instanceof ApiError
    ? { code: error.code, status: error.status, retryable: error.retryable }
    : { code: "INTERNAL_ERROR", status: 500, retryable: true };
  if (operational.status >= 500) {
    c.executionCtx.waitUntil(c.env.DB.prepare(`
      INSERT INTO operational_errors(id, request_id, method, path, error_code, status_code, retryable, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), c.get("requestId"), c.req.method, new URL(c.req.url).pathname,
      operational.code, operational.status, operational.retryable ? 1 : 0, Date.now(),
    ).run().catch(() => undefined));
  }
  return errorResponse(c, error);
});

async function cleanup(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reading_operations WHERE user_id IS NULL AND expires_at IS NOT NULL AND expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM share_snapshots WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)").bind(now, now - 7 * 24 * 60 * 60 * 1000),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM verification WHERE expiresAt <= ?").bind(now),
    env.DB.prepare("DELETE FROM account_exports WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM operational_errors WHERE created_at <= ?").bind(now - 90 * 24 * 60 * 60 * 1000),
  ]);
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
