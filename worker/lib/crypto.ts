const encoder = new TextEncoder();

export function randomToken(bytes = 24): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function verifyHmac(value: string, expected: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const normalized = expected.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return false;
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(value));
}

export async function canonicalFingerprint(value: unknown): Promise<string> {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]));
    }
    return input;
  };
  return sha256(JSON.stringify(canonicalize(value)));
}

