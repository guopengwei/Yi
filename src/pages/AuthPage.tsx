import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Turnstile } from "../components/Turnstile";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

type Mode = "signin" | "signup" | "reset";

export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, refresh, signOut } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const onToken = useCallback((value: string) => setToken(value), []);
  const submit = async () => {
    setBusy(true); setMessage("");
    try {
      if (mode === "reset") {
        await api("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, redirectTo: `${window.location.origin}/auth` }), headers: { "X-Turnstile-Token": token } });
        setMessage(t("auth.verify"));
      } else if (mode === "signup") {
        await api("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name, email, password }), headers: { "X-Turnstile-Token": token } });
        setMessage(t("auth.verify")); setMode("signin");
      } else {
        await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
        await refresh();
        const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || "/history";
        navigate(returnTo, { replace: true });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); }
    finally { setBusy(false); }
  };
  const social = async (provider: "google" | "microsoft") => {
    setBusy(true);
    try {
      const response = await api<{ url?: string }>("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({ provider, callbackURL: `${window.location.origin}/history` }) });
      if (response.url) window.location.assign(response.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); setBusy(false); }
  };
  if (session) return <section className="page narrow auth-page"><div className="glass-panel profile-card"><div className="profile-avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><h1>{session.user.name}</h1><p>{session.user.email}</p><div className="button-row"><button className="button secondary" onClick={() => navigate("/history")}>{t("nav.history")}</button><button className="button quiet" onClick={() => void signOut()}>{t("auth.signOut")}</button></div></div></section>;
  return <section className="page narrow auth-page">
    <div className="auth-intro"><p className="eyebrow">{t("auth.eyebrow")}</p><h1>{t("auth.title")}</h1><p>{t("auth.needAccount")}</p></div>
    <div className="glass-panel auth-form">
      <div className="segmented"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>{t("auth.signIn")}</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>{t("auth.signUp")}</button></div>
      {mode === "signup" && <label className="field"><span>{t("auth.name")}</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
      <label className="field"><span>{t("auth.email")}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {mode !== "reset" && <label className="field"><span>{t("auth.password")}</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
      {(mode === "signup" || mode === "reset") && <Turnstile action={mode === "signup" ? "signup" : "password_recovery"} onToken={onToken} />}
      {message && <p className="small-status" role="status">{message}</p>}
      <button className="button primary wide" disabled={busy || !email || (mode !== "reset" && password.length < 10) || (mode === "signup" && (!name || !token)) || (mode === "reset" && !token)} onClick={() => void submit()}>{busy ? t("common.loading") : mode === "reset" ? t("auth.reset") : t("auth.submit")}</button>
      {mode === "signin" && <><button className="text-button" onClick={() => setMode("reset")}>{t("auth.forgot")}</button><div className="or"><span>{t("auth.or")}</span></div><button className="button social" onClick={() => void social("google")}>{t("auth.google")}</button><button className="button social" onClick={() => void social("microsoft")}>{t("auth.microsoft")}</button></>}
      {mode === "reset" && <button className="text-button" onClick={() => setMode("signin")}>{t("common.back")}</button>}
    </div>
  </section>;
}
