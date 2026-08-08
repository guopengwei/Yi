export class ClientApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string, readonly retryable = false) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      "X-Yi-Locale": localStorage.getItem("yi-locale") || "zh-HK",
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; retryable?: boolean } } | null;
  if (!response.ok) throw new ClientApiError(body?.error?.code ?? "REQUEST_FAILED", response.status, body?.error?.message ?? "Request failed", body?.error?.retryable ?? false);
  return body as T;
}

export function postJson<T>(path: string, body: unknown, headers?: HeadersInit) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body), headers });
}

