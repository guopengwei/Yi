import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession } from "../worker/lib/payments";
import { sendTransactionalEmail } from "../worker/lib/email";
import type { Env } from "../worker/env";

afterEach(() => vi.unstubAllGlobals());

describe("Stripe Checkout request", () => {
  it("uses HKD, an idempotency key, and Stripe dynamic payment methods", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "cs_test_yi",
      object: "checkout.session",
      url: "https://checkout.stripe.com/c/pay/cs_test_yi",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const checkout = await createCheckoutSession({
      STRIPE_SECRET_KEY: "sk_test_yi",
      APP_ORIGIN: "https://yi.example.test",
    } as Env, {
      contributionId: "00000000-0000-4000-8000-000000000018",
      readingId: "00000000-0000-4000-8000-000000000064",
      amountHkd: 18,
      locale: "zh-HK",
    });
    expect(checkout.id).toBe("cs_test_yi");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/checkout/sessions");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("hkd");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1800");
    expect([...form.keys()].some((key) => key.startsWith("payment_method_types"))).toBe(false);
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe("00000000-0000-4000-8000-000000000018");
  });
});

describe("transactional email templates", () => {
  it.each([
    ["zh-HK", "驗證你的 Yi · 易 帳戶"],
    ["zh-CN", "验证你的 Yi · 易 账户"],
    ["en", "Verify your Yi account"],
  ] as const)("sends a localized %s verification message", async (locale, subject) => {
    const send = vi.fn(async (_message: { subject: string; text: string; html: string }) => undefined);
    await sendTransactionalEmail({
      EMAIL: { send },
      EMAIL_FROM: "hello@yi.example.test",
      SUPPORT_EMAIL: "support@yi.example.test",
    } as unknown as Env, {
      to: "reader@example.test",
      kind: "verify",
      locale,
      url: "https://yi.example.test/verify?token=<private>",
    });
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]![0];
    expect(message.subject).toBe(subject);
    expect(message.text).toContain("https://yi.example.test/verify?token=<private>");
    expect(message.html).not.toContain("token=<private>");
    expect(message.html).toContain("token=&lt;private&gt;");
  });
});
