import type { Context } from "hono";
import type { ApiErrorBody } from "../../shared/contracts";
import type { AppVariables, Env } from "../env";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
    message: string,
    readonly retryable = false,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(c: Context<{ Bindings: Env; Variables: AppVariables }>, error: unknown) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError("INTERNAL_ERROR", 500, "The request could not be completed.", true);
  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      message: apiError.message,
      retryable: apiError.retryable,
      requestId: c.get("requestId"),
      ...(apiError.fieldErrors ? { fieldErrors: apiError.fieldErrors } : {}),
    },
  };
  return c.json(body, apiError.status);
}

const sensitiveKeys = /question|message|note|chat|token|secret|email|password|authorization|cookie|content/i;

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      sensitiveKeys.test(key) ? "[REDACTED]" : redactForLog(nested),
    ]));
  }
  return value;
}

