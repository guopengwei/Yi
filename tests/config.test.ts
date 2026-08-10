import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("deployment privacy configuration", () => {
  it("applies static security headers and crawler exclusion to share documents", async () => {
    const headers = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), "../public/_headers"), "utf8");
    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain("script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com");
    expect(headers).toContain("connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com");
    expect(headers).toContain("frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com");
    expect(headers).toContain("Referrer-Policy: strict-origin");
    expect(headers).toMatch(/\/share\/\*[\s\S]*X-Robots-Tag: noindex, nofollow, noarchive/);
    expect(headers).toMatch(/\/share\/\*[\s\S]*Cache-Control: private, no-store/);
  });
});
