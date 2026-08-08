import type { Env } from "../env";
import { sha256 } from "./crypto";
import { ApiError } from "./errors";

export async function enforceRateLimit(env: Env, input: { bucket: string; identity: string; limit: number; windowMs: number }) {
  const now = Date.now();
  const windowStart = Math.floor(now / input.windowMs) * input.windowMs;
  const identityHash = await sha256(input.identity);
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits(bucket, identity_hash, window_start, count, expires_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(bucket, identity_hash, window_start)
    DO UPDATE SET count = count + 1
    RETURNING count
  `).bind(input.bucket, identityHash, windowStart, windowStart + input.windowMs * 2).first<{ count: number }>();
  if (!result || result.count > input.limit) throw new ApiError("RATE_LIMITED", 429, "Too many requests. Please try again later.", true);
}
