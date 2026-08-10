import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables, Env } from "../env";
import { optionalSession } from "../lib/auth";
import { sendTransactionalEmail } from "../lib/email";
import { renderContactNotification } from "../lib/email-templates";
import { clientIp, parseJson } from "../lib/http";
import { enforceRateLimit } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";

const routes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const contactSchema = z.object({
  email: z.email().max(320),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5_000),
  locale: z.enum(["zh-HK", "zh-CN", "en"]),
  turnstileToken: z.string().max(2048),
}).strict();

routes.post("/", async (c) => {
  const body = await parseJson(c, contactSchema);
  const ip = clientIp(c);
  await enforceRateLimit(c.env, { bucket: "contact", identity: `${body.email}:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  await verifyTurnstile(c.env, { token: body.turnstileToken, action: "contact", remoteIp: ip, idempotencyKey: crypto.randomUUID() });
  const session = await optionalSession(c);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO contact_submissions(id, user_id, email, locale, subject, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, session?.user.id ?? null, body.email, body.locale, body.subject, body.message, Date.now()).run();
  const notification = renderContactNotification({
    id,
    locale: body.locale,
    email: body.email,
    subject: body.subject,
    message: body.message,
    siteUrl: c.env.APP_ORIGIN,
  });
  c.executionCtx.waitUntil(Promise.all([
    sendTransactionalEmail(c.env, { to: body.email, kind: "contact-received", locale: body.locale }),
    c.env.EMAIL.send({
      to: c.env.SUPPORT_EMAIL,
      from: { email: c.env.HELLO_EMAIL, name: "Yi · 易 contact" },
      replyTo: body.email,
      subject: `[Yi contact ${id}] ${body.subject}`,
      text: notification.text,
      html: notification.html,
    }),
  ]));
  return c.json({ schemaVersion: "contact@1", id, status: "received" }, 201);
});

export default routes;
