import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { chooseLocale, supportedLocales, type AppLocale } from "../i18n";
import { legalContent } from "../legal-content";
import { useSession } from "../lib/session";

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const locale = (i18n.language in legalContent ? i18n.language : "zh-HK") as AppLocale;
  const legal = legalContent[locale].labels;
  useEffect(() => setOpen(false), [location.pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main">{t("nav.skip")}</a>
    <header className="site-header">
      <Link className="wordmark" to="/" aria-label={t("nav.home")}><span>易</span><strong>Yi</strong></Link>
      <button className="menu-toggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((value) => !value)}>
        <span /><span />
        <span className="sr-only">{t("nav.menu")}</span>
      </button>
      <nav id="primary-nav" className={open ? "primary-nav open" : "primary-nav"} aria-label="Primary navigation">
        <NavLink to="/">{t("nav.cast")}</NavLink>
        <NavLink to="/history">{t("nav.history")}</NavLink>
        <NavLink to="/help">{t("nav.help")}</NavLink>
        <NavLink to="/contact">{t("nav.contact")}</NavLink>
        <NavLink to="/settings">{t("nav.settings")}</NavLink>
        <NavLink className="account-link" to="/auth">{session ? session.user.name : t("nav.account")}</NavLink>
        <label className="locale-compact">
          <span className="sr-only">{t("settings.locale")}</span>
          <select value={i18n.language} onChange={(event) => void chooseLocale(event.target.value as AppLocale)}>
            {supportedLocales.map((locale) => <option key={locale} value={locale}>{locale === "zh-HK" ? "繁" : locale === "zh-CN" ? "简" : "EN"}</option>)}
          </select>
        </label>
      </nav>
    </header>
    <main id="main">{children}</main>
    <footer className="site-footer">
      <div><span className="footer-mark">易</span><p>{t("hero.privacy")}</p></div>
      <div className="footer-legal"><Link to="/privacy">{legal.privacy}</Link><Link to="/terms">{legal.terms}</Link><p>© {new Date().getFullYear()} {legal.company} · Hong Kong</p></div>
    </footer>
  </div>;
}
