import type { Context } from "hono";
import type { ZodType } from "zod";
import type { AppVariables, Env } from "../env";
import { ApiError } from "./errors";

export async function parseJson<T>(c: Context<{ Bindings: Env; Variables: AppVariables }>, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("INVALID_JSON", 400, "Request body must be valid JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors = Object.fromEntries(result.error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]));
    throw new ApiError("INVALID_INPUT", 422, "Some fields are invalid.", false, fieldErrors);
  }
  return result.data;
}

export function requestLocale(c: Context<{ Bindings: Env; Variables: AppVariables }>): "zh-HK" | "zh-CN" | "en" {
  const value = c.req.header("X-Yi-Locale");
  return value === "zh-CN" || value === "en" ? value : "zh-HK";
}

export function clientIp(c: Context<{ Bindings: Env; Variables: AppVariables }>): string {
  return c.req.header("CF-Connecting-IP") || "unknown";
}

export function assertTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
  } catch {
    throw new ApiError("INVALID_TIMEZONE", 422, "Timezone is invalid.", false, { timezone: "Use an IANA timezone." });
  }
}

