import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Turnstile } from "../components/Turnstile";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { getServiceStatus } from "../lib/status";

type Mode = "signin" | "signup" | "reset" | "new-password";

export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, refresh, signOut } = useSession();
  const passwordResetToken = searchParams.get("token") ?? "";
  const [mode, setMode] = useState<Mode>(() => passwordResetToken ? "new-password" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [socialProviders, setSocialProviders] = useState({ google: false, microsoft: false });
  useEffect(() => {
    void getServiceStatus().then((status) => setSocialProviders({
      google: status.googleAuthEnabled,
      microsoft: status.microsoftAuthEnabled,
    })).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (searchParams.get("verified") === "1") setMessage(t("auth.verified"));
    else if (searchParams.has("error")) setMessage(t("auth.invalidLink"));
  }, [searchParams, t]);
  const onToken = useCallback((value: string) => setToken(value), []);
  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setToken("");
    setMessage("");
    setPassword("");
    setPasswordConfirmation("");
    setTurnstileReset((value) => value + 1);
  };
  const submit = async () => {
    setBusy(true); setMessage("");
    try {
      if (mode === "new-password") {
        await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ newPassword: password, token: passwordResetToken }) });
        setMode("signin");
        setPassword("");
        setPasswordConfirmation("");
        setSearchParams({}, { replace: true });
        setMessage(t("auth.resetDone"));
      } else if (mode === "reset") {
        await api("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, redirectTo: `${window.location.origin}/auth` }), headers: { "X-Turnstile-Token": token } });
        setMessage(t("auth.verify"));
      } else if (mode === "signup") {
        await api("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name, email, password, callbackURL: `${window.location.origin}/auth?verified=1` }), headers: { "X-Turnstile-Token": token } });
        setMessage(t("auth.verify")); setMode("signin");
      } else {
        await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
        await refresh();
        const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || "/history";
        navigate(returnTo, { replace: true });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); }
    finally {
      setBusy(false);
      if (mode === "signup" || mode === "reset") { setToken(""); setTurnstileReset((value) => value + 1); }
    }
  };
  const social = async (provider: "google" | "microsoft") => {
    setBusy(true);
    try {
      const response = await api<{ url?: string }>("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({ provider, callbackURL: `${window.location.origin}/history` }) });
      if (response.url) window.location.assign(response.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); setBusy(false); }
  };
  const canSubmit = mode === "new-password"
    ? Boolean(passwordResetToken) && password.length >= 10 && password === passwordConfirmation
    : Boolean(email) && (mode === "reset" || password.length >= 10) &&
      (mode !== "signup" || Boolean(name && token)) && (mode !== "reset" || Boolean(token));
  if (session) return <section className="page narrow auth-page"><div className="glass-panel profile-card"><div className="profile-avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><h1>{session.user.name}</h1><p>{session.user.email}</p><div className="button-row"><button className="button secondary" onClick={() => navigate("/history")}>{t("nav.history")}</button><button className="button quiet" onClick={() => void signOut()}>{t("auth.signOut")}</button></div></div></section>;
  return <section className="page narrow auth-page">
    <div className="auth-intro"><p className="eyebrow">{t("auth.eyebrow")}</p><h1>{mode === "new-password" ? t("auth.newPasswordTitle") : t("auth.title")}</h1><p>{mode === "new-password" ? t("auth.newPasswordBody") : t("auth.needAccount")}</p></div>
    <div className="glass-panel auth-form">
      {mode !== "new-password" && <div className="segmented"><button className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")}>{t("auth.signIn")}</button><button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>{t("auth.signUp")}</button></div>}
      {mode === "signup" && <label className="field"><span>{t("auth.name")}</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {mode !== "new-password" && <label className="field"><span>{t("auth.email")}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
      {mode !== "reset" && <label className="field"><span>{t("auth.password")}</span><input type="password" autoComplete={mode === "signup" || mode === "new-password" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
      {mode === "new-password" && <label className="field"><span>{t("auth.confirmPassword")}</span><input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
      {(mode === "signup" || mode === "reset") && <Turnstile action={mode === "signup" ? "signup" : "password_recovery"} onToken={onToken} resetKey={turnstileReset} />}
      {message && <p className="small-status" role="status">{message}</p>}
      <button className="button primary wide" disabled={busy || !canSubmit} onClick={() => void submit()}>{busy ? t("common.loading") : mode === "reset" ? t("auth.reset") : mode === "new-password" ? t("auth.setPassword") : t("auth.submit")}</button>
      {mode === "signin" && <>
        <button className="text-button" onClick={() => switchMode("reset")}>{t("auth.forgot")}</button>
        {(socialProviders.google || socialProviders.microsoft) && <div className="or"><span>{t("auth.or")}</span></div>}
        {socialProviders.google && <button className="button social" onClick={() => void social("google")}>{t("auth.google")}</button>}
        {socialProviders.microsoft && <button className="button social" onClick={() => void social("microsoft")}>{t("auth.microsoft")}</button>}
      </>}
      {mode === "reset" && <button className="text-button" onClick={() => switchMode("signin")}>{t("common.back")}</button>}
      {mode === "new-password" && <button className="text-button" onClick={() => { setSearchParams({}, { replace: true }); switchMode("signin"); }}>{t("common.back")}</button>}
    </div>
  </section>;
}
