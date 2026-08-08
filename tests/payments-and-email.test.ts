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
    const send = vi.fn(async (_message: { subject: string; text: string; html: string; from: { email: string }; replyTo: string }) => undefined);
    await sendTransactionalEmail({
      EMAIL: { send },
      EMAIL_FROM: "no-reply@example.test",
      HELLO_EMAIL: "hello@example.test",
      SUPPORT_EMAIL: "contact@example.test",
    } as unknown as Env, {
      to: "reader@example.test",
      kind: "verify",
      locale,
      url: "https://yi.example.test/verify?token=<private>",
    });
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]![0];
    expect(message.subject).toBe(subject);
    expect(message.from.email).toBe("no-reply@example.test");
    expect(message.replyTo).toBe("contact@example.test");
    expect(message.text).toContain("https://yi.example.test/verify?token=<private>");
    expect(message.html).not.toContain("token=<private>");
    expect(message.html).toContain("token=&lt;private&gt;");
  });

  it("uses the conversational sender for welcome and contact acknowledgements", async () => {
    const send = vi.fn(async (_message: { from: { email: string }; replyTo: string }) => undefined);
    const env = {
      EMAIL: { send },
      EMAIL_FROM: "no-reply@example.test",
      HELLO_EMAIL: "hello@example.test",
      SUPPORT_EMAIL: "contact@example.test",
    } as unknown as Env;
    await sendTransactionalEmail(env, { to: "reader@example.test", kind: "welcome", locale: "en" });
    await sendTransactionalEmail(env, { to: "reader@example.test", kind: "contact-received", locale: "en" });
    expect(send).toHaveBeenCalledTimes(2);
    for (const [message] of send.mock.calls) {
      expect(message.from.email).toBe("hello@example.test");
      expect(message.replyTo).toBe("contact@example.test");
    }
  });
});
