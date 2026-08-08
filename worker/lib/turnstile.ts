import type { Env } from "../env";
import { ApiError } from "./errors";

interface SiteverifyResult {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(env: Env, input: { token?: string; action: string; remoteIp?: string; idempotencyKey: string }): Promise<void> {
  const token = input.token;
  const allowedHosts = new Set(env.ALLOWED_TURNSTILE_HOSTNAMES.split(",").map((host) => host.trim()).filter(Boolean));
  if (!env.TURNSTILE_SECRET || !token || token.length > 2048 || allowedHosts.size === 0) {
    throw new ApiError("TURNSTILE_REQUIRED", 403, "Bot verification is required.");
  }
  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        idempotency_key: input.idempotencyKey,
        ...(input.remoteIp ? { remoteip: input.remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError("TURNSTILE_UNAVAILABLE", 503, "Bot verification is temporarily unavailable.", true);
  }
  if (!response.ok) throw new ApiError("TURNSTILE_UNAVAILABLE", 503, "Bot verification is temporarily unavailable.", true);
  const result = await response.json<SiteverifyResult>().catch(() => null);
  if (!result?.success || result.action !== input.action || !result.hostname || !allowedHosts.has(result.hostname)) {
    throw new ApiError("TURNSTILE_FAILED", 403, "Bot verification failed.");
  }
}

