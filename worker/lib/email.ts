import type { Locale } from "../../shared/catalog";
import type { Env } from "../env";

type TemplateKind = "verify" | "reset" | "welcome" | "contact-received" | "delete";

const subjects: Record<Locale, Record<TemplateKind, string>> = {
  "zh-HK": { verify: "驗證你的 Yi · 易 帳戶", reset: "重設你的 Yi · 易 密碼", welcome: "歡迎來到 Yi · 易", "contact-received": "我們已收到你的訊息", delete: "確認刪除你的 Yi · 易 帳戶" },
  "zh-CN": { verify: "验证你的 Yi · 易 账户", reset: "重置你的 Yi · 易 密码", welcome: "欢迎来到 Yi · 易", "contact-received": "我们已收到你的消息", delete: "确认删除你的 Yi · 易 账户" },
  en: { verify: "Verify your Yi account", reset: "Reset your Yi password", welcome: "Welcome to Yi", "contact-received": "We received your message", delete: "Confirm deletion of your Yi account" },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function copy(kind: TemplateKind, locale: Locale, url?: string) {
  const safeUrl = url ? escapeHtml(url) : "";
  const content: Record<Locale, Record<TemplateKind, { lead: string; action?: string }>> = {
    "zh-HK": {
      verify: { lead: "請驗證你的電郵地址，以完成帳戶設定。", action: "驗證電郵" },
      reset: { lead: "我們收到重設密碼的請求。如果不是你提出的，可忽略此郵件。", action: "重設密碼" },
      welcome: { lead: "你的帳戶已準備好。願每次閱讀都為你留下更清楚的問題。" },
      "contact-received": { lead: "謝謝你的來信。我們會按順序回覆。" },
      delete: { lead: "你要求刪除帳戶及所有已儲存資料。此操作無法復原；請使用以下連結確認。", action: "確認刪除" },
    },
    "zh-CN": {
      verify: { lead: "请验证你的邮箱地址，以完成账户设置。", action: "验证邮箱" },
      reset: { lead: "我们收到重置密码的请求。如果不是你提出的，可以忽略此邮件。", action: "重置密码" },
      welcome: { lead: "你的账户已准备好。愿每次阅读都为你留下更清楚的问题。" },
      "contact-received": { lead: "谢谢你的来信。我们会按顺序回复。" },
      delete: { lead: "你要求删除账户及所有已保存数据。此操作无法恢复；请使用以下链接确认。", action: "确认删除" },
    },
    en: {
      verify: { lead: "Verify your email address to finish setting up your account.", action: "Verify email" },
      reset: { lead: "We received a password reset request. Ignore this email if it was not you.", action: "Reset password" },
      welcome: { lead: "Your account is ready. May each reading leave you with a clearer question." },
      "contact-received": { lead: "Thank you for writing. We will reply in order." },
      delete: { lead: "You asked to delete your account and all saved data. This cannot be undone; use the link below to confirm.", action: "Confirm deletion" },
    },
  };
  const selected = content[locale][kind];
  const button = url && selected.action
    ? `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#b9562b;color:#fff;text-decoration:none">${selected.action}</a></p>`
    : "";
  return {
    text: `${selected.lead}${url ? `\n\n${url}` : ""}\n\nYi · 易`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#332a24"><h1 style="font-family:Georgia,serif">Yi · 易</h1><p>${selected.lead}</p>${button}<p style="color:#766b62;font-size:13px">yi.rich-tide.com</p></div>`,
  };
}

export async function sendTransactionalEmail(env: Env, input: { to: string; kind: TemplateKind; locale?: Locale; url?: string }) {
  const locale = input.locale ?? "zh-HK";
  const body = copy(input.kind, locale, input.url);
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
