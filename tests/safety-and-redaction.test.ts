import { describe, expect, it } from "vitest";
import { routeSafety } from "../shared/safety";
import { redactForLog } from "../worker/lib/errors";

describe("safety routing", () => {
  it.each([
    ["Should I stop my cancer treatment?", "medical"],
    ["Should I put everything into this stock?", "financial"],
    ["我被家暴，現在怎麼辦？", "abuse-or-coercion"],
    ["我不想活下去了", "self-harm"],
  ])("blocks provider transmission for %s", (text, category) => {
    const result = routeSafety({ kind: "question", text }, "zh-HK");
    expect(result.routed).toBe(true);
    expect(result.providerTransmission).toBe("blocked");
    expect(result.categories).toContain(category);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("leaves a bounded ordinary reflection eligible", () => {
    expect(routeSafety({ kind: "question", text: "What assumption can I test this week?" }, "en")).toMatchObject({ routed: false, providerTransmission: "eligible" });
  });
});

describe("structured log redaction", () => {
  it("removes sensitive keys recursively", () => {
    const redacted = redactForLog({
      question: "private question",
      nested: { note: "private note", content: "chat text", email: "person@example.com", safe: "kept" },
      token: "secret",
    });
    expect(JSON.stringify(redacted)).not.toMatch(/private|person@example|secret/);
    expect(redacted).toMatchObject({ nested: { safe: "kept" } });
  });
});
