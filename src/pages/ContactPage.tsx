import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Turnstile } from "../components/Turnstile";
import { postJson } from "../lib/api";

export function ContactPage() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((value: string) => setToken(value), []);
  const submit = async () => {
    setBusy(true); setStatus("");
    try {
      await postJson("/api/v1/contact", { email, subject, message, locale: i18n.language, turnstileToken: token });
      setStatus(t("contact.received")); setSubject(""); setMessage("");
    } catch (error) { setStatus(error instanceof Error ? error.message : t("common.error")); }
    finally { setBusy(false); setToken(""); setTurnstileReset((value) => value + 1); }
  };
  return <section className="page narrow contact-page">
    <header><p className="eyebrow">{t("contact.eyebrow")}</p><h1>{t("contact.title")}</h1><p>contact@rich-tide.com</p></header>
    <div className="glass-panel contact-form">
      <label className="field"><span>{t("auth.email")}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field"><span>{t("contact.subject")}</span><input maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="field"><span>{t("contact.message")}</span><textarea rows={8} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
      <Turnstile action="contact" onToken={onToken} resetKey={turnstileReset} />
      {status && <p className="small-status" role="status">{status}</p>}
      <button className="button primary" disabled={busy || !email || !subject || !message || !token} onClick={() => void submit()}>{busy ? t("common.loading") : t("contact.send")}</button>
    </div>
  </section>;
}
