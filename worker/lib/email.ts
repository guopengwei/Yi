import type { Locale } from "../../shared/catalog";
import type { Env } from "../env";
import { renderTransactionalEmail, type TransactionalTemplateKind } from "./email-templates";

type TemplateKind = TransactionalTemplateKind;

const subjects: Record<Locale, Record<TemplateKind, string>> = {
  "zh-HK": { verify: "驗證你的 Yi · 易 帳戶", reset: "重設你的 Yi · 易 密碼", welcome: "歡迎來到 Yi · 易", "contact-received": "我們已收到你的訊息", delete: "確認刪除你的 Yi · 易 帳戶" },
  "zh-CN": { verify: "验证你的 Yi · 易 账户", reset: "重置你的 Yi · 易 密码", welcome: "欢迎来到 Yi · 易", "contact-received": "我们已收到你的消息", delete: "确认删除你的 Yi · 易 账户" },
  en: { verify: "Verify your Yi account", reset: "Reset your Yi password", welcome: "Welcome to Yi", "contact-received": "We received your message", delete: "Confirm deletion of your Yi account" },
};

export async function sendTransactionalEmail(env: Env, input: { to: string; kind: TemplateKind; locale?: Locale; url?: string }) {
  const locale = input.locale ?? "zh-HK";
  const body = renderTransactionalEmail({
    kind: input.kind,
    locale,
    url: input.url,
    supportEmail: env.SUPPORT_EMAIL,
    siteUrl: env.APP_ORIGIN,
  });
  const fromEmail = input.kind === "welcome" || input.kind === "contact-received"
    ? env.HELLO_EMAIL
    : env.EMAIL_FROM;
  return env.EMAIL.send({
    to: input.to,
    from: { email: fromEmail, name: "Yi · 易" },
    replyTo: env.SUPPORT_EMAIL,
    subject: subjects[locale][input.kind],
    text: body.text,
    html: body.html,
  });
}
