import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { chooseLocale, supportedLocales, type AppLocale } from "../i18n";
import { legalContent } from "../legal-content";
import { useSession } from "../lib/session";

export type MobileChromeMode = "normal" | "focused";

interface MobileShellValue {
  chrome: MobileChromeMode;
  setChrome: (mode: MobileChromeMode) => void;
}

const MobileShellContext = createContext<MobileShellValue | null>(null);

export function MobileShellProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<MobileChromeMode>("normal");
  return <MobileShellContext.Provider value={{ chrome, setChrome }}>{children}</MobileShellContext.Provider>;
}

export function useMobileShell(mode?: MobileChromeMode) {
  const context = useContext(MobileShellContext);
  if (!context) throw new Error("useMobileShell must be used inside MobileShellProvider");
  useEffect(() => {
    if (!mode) return;
    context.setChrome(mode);
    return () => context.setChrome("normal");
  }, [context.setChrome, mode]);
  return context;
}

export function MobileShellChrome({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const { chrome } = useMobileShell();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const locale = (i18n.language in legalContent ? i18n.language : "zh-HK") as AppLocale;
  const legal = legalContent[locale].labels;

  useEffect(() => setMoreOpen(false), [location.pathname]);

  return <div className={`app-shell chrome-${chrome}`}>
    <a className="skip-link" href="#main">{t("nav.skip")}</a>
    <header className="site-header">
      <Link className="wordmark" to="/" aria-label={t("nav.home")}><span>易</span><strong>Yi</strong></Link>
      <nav className="primary-nav" aria-label={t("nav.primaryLabel")}>
        <NavLink to="/">{t("nav.cast")}</NavLink>
        <NavLink to="/history">{t("nav.history")}</NavLink>
        <NavLink to="/help">{t("nav.help")}</NavLink>
        <NavLink to="/contact">{t("nav.contact")}</NavLink>
        <NavLink to="/settings">{t("nav.settings")}</NavLink>
        <NavLink className="account-link" to="/auth">{session ? session.user.name : t("nav.account")}</NavLink>
        <label className="locale-compact">
          <span className="sr-only">{t("settings.locale")}</span>
          <select value={i18n.language} onChange={(event) => void chooseLocale(event.target.value as AppLocale)}>
            {supportedLocales.map((value) => <option key={value} value={value}>{localeName(value)}</option>)}
          </select>
        </label>
      </nav>
      <button className="mobile-more-toggle" type="button" aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="mobile-more-sheet" onClick={() => setMoreOpen(true)}>
        <MoreIcon />
        <span className="sr-only">{t("nav.more")}</span>
      </button>
    </header>
    <main id="main">{children}</main>
    <footer className="site-footer">
      <div><span className="footer-mark">易</span></div>
      <div className="footer-legal"><Link to="/privacy">{legal.privacy}</Link><Link to="/terms">{legal.terms}</Link><p>© {new Date().getFullYear()} {legal.company} · Hong Kong</p></div>
    </footer>
    <MobileBottomNav />
    <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
  </div>;
}

function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const castActive = location.pathname === "/" || location.pathname.startsWith("/reading/") || location.pathname.startsWith("/share/");
  const accountActive = ["/auth", "/settings", "/contact", "/privacy", "/terms"].some((path) => location.pathname.startsWith(path));
  return <nav className="mobile-bottom-nav" aria-label={t("nav.mobileLabel")}>
    <Link className={castActive ? "active" : ""} aria-current={castActive ? "page" : undefined} to="/"><CastIcon /><span>{t("nav.castShort")}</span></Link>
    <NavLink to="/history"><HistoryIcon /><span>{t("nav.historyShort")}</span></NavLink>
    <NavLink to="/help"><HelpIcon /><span>{t("nav.helpShort")}</span></NavLink>
    <Link className={accountActive ? "active" : ""} aria-current={accountActive ? "page" : undefined} to="/auth"><AccountIcon /><span>{t("nav.accountShort")}</span></Link>
  </nav>;
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const locale = (i18n.language in legalContent ? i18n.language : "zh-HK") as AppLocale;
  const legal = legalContent[locale].labels;

  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger.current?.focus();
    };
  }, [onClose, open]);

  useEffect(() => { if (open) onClose(); }, [location.pathname]);

  if (!open) return null;
  return <div className="sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div id="mobile-more-sheet" className="more-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
      <div className="sheet-handle" aria-hidden="true" />
      <header><div><p className="eyebrow">Yi · 易</p><h2 id={titleId}>{t("nav.more")}</h2></div><button ref={closeButton} type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}><CloseIcon /></button></header>
      <nav className="sheet-links" aria-label={t("nav.moreLabel")}>
        <Link to="/settings"><SettingsIcon /><span><strong>{t("nav.settings")}</strong><small>{t("nav.settingsHint")}</small></span><span aria-hidden="true">›</span></Link>
        <Link to="/contact"><ContactIcon /><span><strong>{t("nav.contact")}</strong><small>{t("nav.contactHint")}</small></span><span aria-hidden="true">›</span></Link>
      </nav>
      <label className="sheet-locale"><span>{t("settings.locale")}</span><select value={i18n.language} onChange={(event) => void chooseLocale(event.target.value as AppLocale)}>{supportedLocales.map((value) => <option key={value} value={value}>{localeFullName(value)}</option>)}</select></label>
      <div className="sheet-legal"><Link to="/privacy">{legal.privacy}</Link><Link to="/terms">{legal.terms}</Link></div>
    </div>
  </div>;
}

function localeName(locale: AppLocale) { return locale === "zh-HK" ? "繁" : locale === "zh-CN" ? "简" : "EN"; }
function localeFullName(locale: AppLocale) { return locale === "zh-HK" ? "繁體中文" : locale === "zh-CN" ? "简体中文" : "English"; }

type IconProps = { className?: string };
function Icon({ children, className }: { children: ReactNode; className?: string }) { return <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>; }
function CastIcon(props: IconProps) { return <Icon {...props}><path d="M5 5h14M5 12h14M5 19h14" /><path d="M10 12h4" stroke="var(--paper)" strokeWidth="3.5" /></Icon>; }
function HistoryIcon(props: IconProps) { return <Icon {...props}><path d="M4.5 7.5h15v12h-15zM8 4.5h8M8 11h8M8 15h5" /></Icon>; }
function HelpIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="M9.8 9.5a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 1.8-2.4 3.5M12 17.5h.01" /></Icon>; }
function AccountIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" /></Icon>; }
function MoreIcon(props: IconProps) { return <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>; }
function CloseIcon(props: IconProps) { return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>; }
function SettingsIcon(props: IconProps) { return <Icon {...props}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Icon>; }
function ContactIcon(props: IconProps) { return <Icon {...props}><path d="M4 5.5h16v12H8l-4 3z" /><path d="m6.5 8 5.5 4 5.5-4" /></Icon>; }
