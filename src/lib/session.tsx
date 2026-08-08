import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

interface SessionData { user: { id: string; name: string; email: string; image?: string | null; emailVerified: boolean }; session: unknown }
interface SessionContextValue { session: SessionData | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const value = await api<SessionData | null>("/api/auth/get-session");
      if (value?.user) {
        const storedLocale = localStorage.getItem("yi-locale");
        await api("/api/v1/account/claim-guest", {
          method: "POST",
          body: JSON.stringify(storedLocale ? { locale: storedLocale } : {}),
        }).catch(() => undefined);
      }
      setSession(value?.user ? value : null);
    } catch { setSession(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signOut = useCallback(async () => {
    await api("/api/auth/sign-out", { method: "POST", body: "{}" });
    setSession(null);
  }, []);
  const value = useMemo(() => ({ session, loading, refresh, signOut }), [session, loading, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
