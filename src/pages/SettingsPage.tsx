import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { chooseLocale, type AppLocale } from "../i18n";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

type FontSize = "small" | "medium" | "large";
type Theme = "light" | "dark" | "system";

function applyAppearance(fontSize: FontSize, theme: Theme) {
  document.documentElement.dataset.font = fontSize;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("yi-font-size", fontSize);
  localStorage.setItem("yi-theme", theme);
}

export function SettingsPage() {
  const { t, i18n } = useTranslation(); const { session } = useSession();
  const [locale, setLocale] = useState<AppLocale>(i18n.language as AppLocale);
  const [fontSize, setFontSize] = useState<FontSize>((localStorage.getItem("yi-font-size") as FontSize) || "medium");
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("yi-theme") as Theme) || "system");
  const [message, setMessage] = useState("");
  useEffect(() => { if (!session) return; void api<{ profile: { locale: AppLocale; fontSize: FontSize; theme: Theme } }>("/api/v1/account/profile").then((value) => { setLocale(value.profile.locale); setFontSize(value.profile.fontSize); setTheme(value.profile.theme); applyAppearance(value.profile.fontSize, value.profile.theme); }); }, [session]);
  const save = async () => { await chooseLocale(locale); applyAppearance(fontSize, theme); if (session) await api("/api/v1/account/settings", { method: "PATCH", body: JSON.stringify({ locale, fontSize, theme }) }); setMessage(t("settings.save")); };
  const requestDelete = async () => { if (!session) return; await api("/api/auth/delete-user", { method: "POST", body: JSON.stringify({ callbackURL: window.location.origin }) }); setMessage(t("settings.deleteBody")); };
  return <section className="page narrow settings-page"><header className="page-header"><div><p className="eyebrow">{t("settings.eyebrow")}</p><h1>{t("settings.title")}</h1></div></header><div className="glass-panel settings-form">
    <fieldset><legend>{t("settings.locale")}</legend><div className="choice-grid">{(["zh-HK", "zh-CN", "en"] as AppLocale[]).map((value) => <label className={locale === value ? "choice active" : "choice"} key={value}><input type="radio" name="locale" value={value} checked={locale === value} onChange={() => setLocale(value)} /><span>{value === "zh-HK" ? "繁體中文" : value === "zh-CN" ? "简体中文" : "English"}</span></label>)}</div></fieldset>
    <fieldset><legend>{t("settings.font")}</legend><div className="choice-grid">{(["small", "medium", "large"] as FontSize[]).map((value) => <label className={fontSize === value ? "choice active" : "choice"} key={value}><input type="radio" name="font" checked={fontSize === value} onChange={() => { setFontSize(value); applyAppearance(value, theme); }} /><span>{t(`settings.${value}`)}</span></label>)}</div></fieldset>
    <fieldset><legend>{t("settings.theme")}</legend><div className="choice-grid">{(["light", "dark", "system"] as Theme[]).map((value) => <label className={theme === value ? "choice active" : "choice"} key={value}><input type="radio" name="theme" checked={theme === value} onChange={() => { setTheme(value); applyAppearance(fontSize, value); }} /><span>{t(`settings.${value}`)}</span></label>)}</div></fieldset>
    <button className="button primary" onClick={() => void save()}>{t("settings.save")}</button>{message && <p className="small-status" role="status">{message}</p>}
  </div>{session && <div className="account-data glass-panel"><a className="button secondary" href="/api/v1/account/export">{t("settings.export")}</a><div><h2>{t("settings.delete")}</h2><p>{t("settings.deleteBody")}</p><button className="button danger" onClick={() => void requestDelete()}>{t("settings.delete")}</button></div></div>}</section>;
}
