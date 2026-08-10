import type { Locale } from "../../shared/catalog";

export type TransactionalTemplateKind = "verify" | "reset" | "welcome" | "contact-received" | "delete";

interface TransactionalTemplateCopy {
  category: string;
  title: string;
  lead: string;
  note: string;
  action?: string;
}

interface TemplateUiCopy {
  fallback: string;
  support: string;
}

const DEFAULT_SITE_URL = "https://yi.rich-tide.com";

const transactionalCopy: Record<Locale, Record<TransactionalTemplateKind, TransactionalTemplateCopy>> = {
  "zh-HK": {
    verify: {
      category: "帳戶設定",
      title: "確認你的電郵地址",
      lead: "請驗證你的電郵地址，完成帳戶設定。",
      note: "此連結只供你本人使用。如你沒有建立 Yi 帳戶，可忽略此郵件。",
      action: "驗證電郵",
    },
    reset: {
      category: "帳戶安全",
      title: "設定新的密碼",
      lead: "我們收到重設密碼的請求。如非你本人提出，可忽略此郵件。",
      note: "此連結有時效限制。Yi 不會透過電郵要求你提供密碼。",
      action: "重設密碼",
    },
    welcome: {
      category: "歡迎",
      title: "你的閱讀空間已準備好",
      lead: "你的帳戶已準備好。願每次閱讀，都能讓你帶著更清晰的問題。",
      note: "你現在可以儲存閱讀、加入筆記，並繼續對話。",
    },
    "contact-received": {
      category: "支援",
      title: "你的訊息已送達",
      lead: "謝謝你的來信。我們會按順序回覆。",
      note: "如要補充資料，可直接回覆此郵件。",
    },
    delete: {
      category: "帳戶刪除",
      title: "請仔細確認這項要求",
      lead: "你要求刪除帳戶及所有已儲存資料。此操作無法復原，請按以下連結確認。",
      note: "如你沒有提出刪除要求，請勿開啟確認連結，並立即聯絡我們。",
      action: "確認刪除",
    },
  },
  "zh-CN": {
    verify: {
      category: "账户设置",
      title: "确认你的邮箱地址",
      lead: "请验证你的邮箱地址，完成账户设置。",
      note: "此链接仅供你本人使用。如果你没有创建 Yi 账户，可以忽略此邮件。",
      action: "验证邮箱",
    },
    reset: {
      category: "账户安全",
      title: "设置新密码",
      lead: "我们收到重置密码的请求。如非你本人提出，可忽略此邮件。",
      note: "此链接有时效限制。Yi 不会通过邮件要求你提供密码。",
      action: "重置密码",
    },
    welcome: {
      category: "欢迎",
      title: "你的阅读空间已准备好",
      lead: "你的账户已准备好。愿每次阅读，都能让你带着更清晰的问题。",
      note: "你现在可以保存阅读、添加笔记，并继续对话。",
    },
    "contact-received": {
      category: "支持",
      title: "你的消息已送达",
      lead: "谢谢你的来信。我们会按顺序回复。",
      note: "如需补充信息，可以直接回复此邮件。",
    },
    delete: {
      category: "账户删除",
      title: "请仔细确认此请求",
      lead: "你要求删除账户及所有已保存数据。此操作无法恢复，请点击以下链接确认。",
      note: "如果你没有提出删除请求，请勿打开确认链接，并立即联系我们。",
      action: "确认删除",
    },
  },
  en: {
    verify: {
      category: "Account setup",
      title: "Confirm your email address",
      lead: "Verify your email address to finish setting up your account.",
      note: "This link is for you only. If you did not create a Yi account, you can ignore this email.",
      action: "Verify email",
    },
    reset: {
      category: "Account security",
      title: "Choose a new password",
      lead: "We received a password reset request. Ignore this email if it was not you.",
      note: "This link expires. Yi will never ask you to send your password by email.",
      action: "Reset password",
    },
    welcome: {
      category: "Welcome",
      title: "Your reading space is ready",
      lead: "Your account is ready. May each reading leave you with a clearer question.",
      note: "You can now save readings, add notes, and continue conversations.",
    },
    "contact-received": {
      category: "Support",
      title: "Your message reached us",
      lead: "Thank you for writing. We will reply in order.",
      note: "Reply to this email if you need to add more information.",
    },
    delete: {
      category: "Account deletion",
      title: "Review this request carefully",
      lead: "You asked to delete your account and all saved data. This cannot be undone; use the link below to confirm.",
      note: "If you did not request deletion, do not open the confirmation link. Contact us immediately.",
      action: "Confirm deletion",
    },
  },
};

const uiCopy: Record<Locale, TemplateUiCopy> = {
  "zh-HK": {
    fallback: "如按鈕無法開啟，請將以下連結貼到瀏覽器：",
    support: "需要協助？請回覆此郵件，或聯絡",
  },
  "zh-CN": {
    fallback: "如果按钮无法打开，请将以下链接粘贴到浏览器：",
    support: "需要帮助？请回复此邮件，或联系",
  },
  en: {
    fallback: "If the button does not open, paste this link into your browser:",
    support: "Need help? Reply to this email or contact",
  },
};

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function displaySiteUrl(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return "yi.rich-tide.com";
  }
}

function renderEmailDocument(input: {
  locale: Locale | "en";
  preview: string;
  category: string;
  title: string;
  lead: string;
  contentHtml: string;
  footerHtml: string;
  siteUrl?: string;
}): string {
  const siteUrl = input.siteUrl ?? DEFAULT_SITE_URL;
  const safeSiteUrl = escapeEmailHtml(siteUrl);
  const safeSiteLabel = escapeEmailHtml(displaySiteUrl(siteUrl));

  return `<!doctype html>
<html lang="${input.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeEmailHtml(input.title)}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    table { border-spacing: 0; }
    td { mso-line-height-rule: exactly; }
    img { border: 0; display: block; }
    a { color: #7b2e20; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    .email-heading { font-family: "Iowan Old Style", "Palatino Linotype", "Noto Serif HK", "Noto Serif TC", "Noto Serif SC", "Songti HK", "Songti TC", "Songti SC", Georgia, serif !important; }
    .email-copy { font-family: "Avenir Next", Avenir, "Noto Sans HK", "Noto Sans TC", "Noto Sans SC", "PingFang HK", "PingFang TC", "PingFang SC", "Microsoft JhengHei", "Microsoft YaHei", "Segoe UI", Arial, sans-serif !important; }
    @media screen and (max-width: 620px) {
      .email-frame { width: 100% !important; }
      .email-card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .email-title { font-size: 30px !important; line-height: 36px !important; }
      .masthead-meta { text-align: left !important; padding-top: 16px !important; }
      .masthead-cell { display: block !important; width: 100% !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background: #111714 !important; }
      .email-card { background: #18211d !important; border-color: #39443e !important; }
      .email-rule { border-color: #39443e !important; }
      .email-panel { background: #151d19 !important; border-color: #39443e !important; }
      .email-ink { color: #edf2ee !important; }
      .email-muted { color: #a8b2ac !important; }
      .email-accent { color: #e48670 !important; }
      .email-mark { color: #edf2ee !important; border-color: #718079 !important; }
      .email-link { color: #e48670 !important; }
      .email-button-cell { background: #d87862 !important; }
      .email-button { color: #111714 !important; }
    }
  </style>
</head>
<body class="email-bg email-copy" style="margin:0;padding:0;background:#eef1ee;color:#1e2823;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeEmailHtml(input.preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-bg email-copy" style="width:100%;background:#eef1ee;font-family:'Avenir Next',Avenir,'Noto Sans HK','Noto Sans TC','Noto Sans SC','PingFang HK','PingFang TC','PingFang SC','Microsoft JhengHei','Microsoft YaHei','Segoe UI',Arial,sans-serif;">
    <tr>
      <td align="center" style="padding:34px 12px 42px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-frame email-card" style="width:600px;max-width:600px;background:#fbfcfa;border:1px solid #d5dad6;border-radius:18px;box-shadow:0 18px 54px rgba(33,55,46,.08);">
          <tr>
            <td class="email-pad email-rule" style="padding:28px 38px 26px;border-bottom:1px solid #d5dad6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="masthead-cell" width="62%" style="width:62%;vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="email-mark email-heading" align="center" valign="middle" width="42" height="42" style="width:42px;height:42px;border:1px solid #1e2823;border-radius:50%;color:#1e2823;font-size:24px;line-height:42px;">易</td>
                        <td class="email-heading email-ink" style="padding-left:12px;color:#1e2823;font-size:19px;line-height:24px;font-weight:500;">Yi</td>
                      </tr>
                    </table>
                  </td>
                  <td class="masthead-cell masthead-meta email-accent" align="right" style="width:38%;vertical-align:middle;color:#7b2e20;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeEmailHtml(input.category)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:48px 38px 38px;">
              <h1 class="email-heading email-ink email-title" style="margin:0 0 18px;color:#1e2823;font-size:38px;line-height:44px;font-weight:500;letter-spacing:-.5px;">${escapeEmailHtml(input.title)}</h1>
              <p class="email-ink" style="margin:0;color:#1e2823;font-size:17px;line-height:29px;">${escapeEmailHtml(input.lead)}</p>
              ${input.contentHtml}
            </td>
          </tr>
          <tr>
            <td class="email-pad email-rule" style="padding:24px 38px 30px;border-top:1px solid #d5dad6;">
              ${input.footerHtml}
              <p class="email-muted" style="margin:15px 0 0;color:#5e6a64;font-size:12px;line-height:20px;"><a href="${safeSiteUrl}" class="email-link" style="color:#7b2e20;text-decoration:none;">${safeSiteLabel}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderTransactionalEmail(input: {
  kind: TransactionalTemplateKind;
  locale: Locale;
  url?: string;
  supportEmail: string;
  siteUrl?: string;
}): { text: string; html: string } {
  const selected = transactionalCopy[input.locale][input.kind];
  const common = uiCopy[input.locale];
  const safeSupportEmail = escapeEmailHtml(input.supportEmail);
  const actionHtml = input.url && selected.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0;">
                <tr>
                  <td class="email-button-cell" bgcolor="#a33f2b" style="background:#a33f2b;border-radius:10px;text-align:center;mso-padding-alt:14px 22px;">
                    <a href="${escapeEmailHtml(input.url)}" target="_blank" rel="noopener" class="email-button" style="display:inline-block;padding:14px 22px;color:#fbfcfa;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;white-space:nowrap;">${escapeEmailHtml(selected.action)}</a>
                  </td>
                </tr>
              </table>
              <div class="email-panel" style="margin:24px 0 0;padding:17px 18px;background:#f1f4f0;border:1px solid #d5dad6;border-radius:12px;">
                <p class="email-muted" style="margin:0 0 7px;color:#5e6a64;font-size:12px;line-height:19px;">${escapeEmailHtml(common.fallback)}</p>
                <p style="margin:0;font-size:12px;line-height:19px;word-break:break-all;"><a href="${escapeEmailHtml(input.url)}" class="email-link" style="color:#7b2e20;text-decoration:underline;">${escapeEmailHtml(input.url)}</a></p>
              </div>`
    : "";
  const noteHtml = `<div style="margin:30px 0 0;padding:2px 0 2px 17px;border-left:3px solid #a33f2b;">
                <p class="email-muted" style="margin:0;color:#5e6a64;font-size:13px;line-height:22px;">${escapeEmailHtml(selected.note)}</p>
              </div>`;
  const footerHtml = `<p class="email-muted" style="margin:0;color:#5e6a64;font-size:12px;line-height:20px;">${escapeEmailHtml(common.support)} <a href="mailto:${safeSupportEmail}" class="email-link" style="color:#7b2e20;text-decoration:underline;">${safeSupportEmail}</a>.</p>`;
  const actionText = input.url && selected.action
    ? `${selected.action}:\n${input.url}`
    : "";
  const text = [
    "Yi · 易",
    selected.title,
    selected.lead,
    actionText,
    selected.note,
    `${common.support} ${input.supportEmail}.`,
    displaySiteUrl(input.siteUrl ?? DEFAULT_SITE_URL),
  ].filter(Boolean).join("\n\n");

  return {
    text,
    html: renderEmailDocument({
      locale: input.locale,
      preview: selected.lead,
      category: selected.category,
      title: selected.title,
      lead: selected.lead,
      contentHtml: `${actionHtml}${noteHtml}`,
      footerHtml,
      siteUrl: input.siteUrl,
    }),
  };
}

export function renderContactNotification(input: {
  id: string;
  locale: Locale;
  email: string;
  subject: string;
  message: string;
  siteUrl?: string;
}): { text: string; html: string } {
  const safeEmail = escapeEmailHtml(input.email);
  const safeId = escapeEmailHtml(input.id);
  const safeLocale = escapeEmailHtml(input.locale);
  const safeMessage = escapeEmailHtml(input.message).replace(/\r?\n/g, "<br>");
  const contentHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-panel" style="width:100%;margin:30px 0 0;background:#f1f4f0;border:1px solid #d5dad6;border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px 8px;">
                    <p class="email-muted" style="margin:0 0 4px;color:#5e6a64;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Reply address</p>
                    <p class="email-ink" style="margin:0;color:#1e2823;font-size:14px;line-height:22px;word-break:break-all;"><a href="mailto:${safeEmail}" class="email-link" style="color:#7b2e20;text-decoration:underline;">${safeEmail}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 20px 8px;">
                    <p class="email-muted" style="margin:0 0 4px;color:#5e6a64;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Language</p>
                    <p class="email-ink" style="margin:0;color:#1e2823;font-size:14px;line-height:22px;">${safeLocale}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 20px 18px;">
                    <p class="email-muted" style="margin:0 0 4px;color:#5e6a64;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Submission ID</p>
                    <p class="email-ink" style="margin:0;color:#1e2823;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:20px;word-break:break-all;">${safeId}</p>
                  </td>
                </tr>
              </table>
              <div style="margin:30px 0 0;padding:2px 0 2px 17px;border-left:3px solid #a33f2b;">
                <p class="email-muted" style="margin:0 0 8px;color:#5e6a64;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Message</p>
                <p class="email-ink" style="margin:0;color:#1e2823;font-size:15px;line-height:25px;word-break:break-word;">${safeMessage}</p>
              </div>`;

  return {
    text: `Contact ID: ${input.id}\nLocale: ${input.locale}\nReply to: ${input.email}\nSubject: ${input.subject}\n\n${input.message}`,
    html: renderEmailDocument({
      locale: "en",
      preview: `New contact message from ${input.email}`,
      category: "Support inbox",
      title: input.subject,
      lead: "Reply to this email to respond to the sender.",
      contentHtml,
      footerHtml: `<p class="email-muted" style="margin:0;color:#5e6a64;font-size:12px;line-height:20px;">This operational message was generated by the Yi contact form.</p>`,
      siteUrl: input.siteUrl,
    }),
  };
}
