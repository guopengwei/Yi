import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppVariables, Env } from "../env";
import { hmac, randomToken, sha256, verifyHmac } from "./crypto";
import { ApiError } from "./errors";

export interface Identity {
  kind: "user" | "guest";
  key: string;
  userId: string | null;
  guestIdHash: string | null;
}

function guestSecret(env: Env): string {
  const configured = env.SHARE_SIGNING_KEY || env.BETTER_AUTH_SECRET;
  if (configured) return configured;
  if (env.APP_ENV === "development") return "development-only-guest-secret-change-me";
  throw new ApiError("GUEST_IDENTITY_NOT_CONFIGURED", 503, "Guest identity signing is not configured.");
}

export async function guestIdentity(c: Context<{ Bindings: Env; Variables: AppVariables }>): Promise<Identity> {
  const cookie = getCookie(c, "yi_guest");
  let token: string | undefined;
  if (cookie) {
    const [candidate, signature] = cookie.split(".");
    if (candidate && signature && await verifyHmac(candidate, signature, guestSecret(c.env))) token = candidate;
  }
  if (!token) {
    token = randomToken(24);
    const signature = await hmac(token, guestSecret(c.env));
    setCookie(c, "yi_guest", `${token}.${signature}`, {
      httpOnly: true,
      secure: c.env.APP_ENV !== "development",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  const guestIdHash = await sha256(token);
  return { kind: "guest", key: `guest:${guestIdHash}`, userId: null, guestIdHash };
}
