import { betterAuth } from "better-auth";
import type { Context } from "hono";
import type { Locale } from "../../shared/catalog";
import type { AppVariables, Env } from "../env";
import { ApiError } from "./errors";
import { sendTransactionalEmail } from "./email";

function configuredProvider(clientId?: string, clientSecret?: string) {
  return Boolean(clientId?.trim() && clientSecret?.trim());
}

async function userLocale(env: Env, userId: string): Promise<Locale> {
  const row = await env.DB.prepare("SELECT locale FROM profiles WHERE user_id = ?").bind(userId).first<{ locale: Locale }>();
  return row?.locale ?? "zh-HK";
}

async function requestedUserLocale(env: Env, userId: string, request?: Request): Promise<Locale> {
  const requested = request?.headers.get("X-Yi-Locale");
  if (requested === "zh-HK" || requested === "zh-CN" || requested === "en") {
    await env.DB.prepare("UPDATE profiles SET locale = ?, updated_at = ? WHERE user_id = ?")
      .bind(requested, Date.now(), userId).run();
    return requested;
  }
  return userLocale(env, userId);
}

export function createAuth(env: Env, executionCtx?: { waitUntil(promise: Promise<unknown>): void }) {
  if (!env.BETTER_AUTH_SECRET) throw new ApiError("AUTH_NOT_CONFIGURED", 503, "Authentication is not configured.");
  const socialProviders: Record<string, { clientId: string; clientSecret: string; scope?: string[] }> = {};
  if (configuredProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! };
  }
  if (configuredProvider(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET)) {
    // Better Auth rejects provider profiles without an email. Deliberately do not synthesize one.
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID!,
      clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      scope: ["openid", "profile", "email"],
    };
  }

  const send = (promise: Promise<unknown>) => {
    if (executionCtx) executionCtx.waitUntil(promise);
    else void promise;
  };

  return betterAuth({
    appName: "Yi · 易",
    database: env.DB,
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        send(sendTransactionalEmail(env, { to: user.email, kind: "reset", locale: await requestedUserLocale(env, user.id, request), url }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }, request) => {
        send(sendTransactionalEmail(env, { to: user.email, kind: "verify", locale: await requestedUserLocale(env, user.id, request), url }));
      },
      afterEmailVerification: async (user, request) => {
        send(sendTransactionalEmail(env, { to: user.email, kind: "welcome", locale: await requestedUserLocale(env, user.id, request) }));
      },
    },
    socialProviders,
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "microsoft", "credential"],
        allowDifferentEmails: false,
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }, request) => {
          send(sendTransactionalEmail(env, { to: user.email, kind: "delete", locale: await requestedUserLocale(env, user.id, request), url }));
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const adminEmails = new Set((env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
            if (adminEmails.has(user.email.toLowerCase())) {
              await env.DB.prepare("UPDATE profiles SET role = 'admin', updated_at = ? WHERE user_id = ?")
                .bind(Date.now(), user.id).run();
            }
          },
        },
        delete: {
          before: async (user) => {
            const conversations = await env.DB.prepare("SELECT id FROM chat_conversations WHERE user_id = ?")
              .bind(user.id).all<{ id: string }>();
            for (const conversation of conversations.results) {
              await env.CHAT.getByName(conversation.id).erase(user.id);
            }
          },
        },
      },
    },
    advanced: {
      useSecureCookies: env.APP_ENV !== "development",
      cookiePrefix: "yi",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.APP_ENV !== "development",
        path: "/",
      },
      database: { generateId: "uuid" },
    },
  });
}

export type AuthSession = Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;

export async function optionalSession(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
): Promise<NonNullable<AuthSession> | null> {
  if (!c.env.BETTER_AUTH_SECRET) {
    if (c.env.APP_ENV === "production") throw new ApiError("AUTH_NOT_CONFIGURED", 503, "Authentication is not configured.");
    return null;
  }
  const auth = createAuth(c.env, c.executionCtx);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const profile = await c.env.DB.prepare("SELECT status FROM profiles WHERE user_id = ?").bind(session.user.id).first<{ status: string }>();
  if (profile?.status === "suspended") throw new ApiError("ACCOUNT_SUSPENDED", 403, "This account is suspended.");
  return session;
}

export async function requireSession(c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const session = await optionalSession(c);
  if (!session) throw new ApiError("AUTH_REQUIRED", 401, "Sign in to continue.");
  return session;
}

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const session = await requireSession(c);
  const profile = await c.env.DB.prepare("SELECT role FROM profiles WHERE user_id = ?").bind(session.user.id).first<{ role: string }>();
  if (profile?.role !== "admin") throw new ApiError("ADMIN_REQUIRED", 403, "Administrator access is required.");
  return session;
}
