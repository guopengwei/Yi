import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { hexagramName } from "../lib/hexagram-name";

interface Archive { id: string; title: string | null; question: string | null; facts: CastFacts; createdAt: string }

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [items, setItems] = useState<Archive[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/auth", { replace: true }); return; }
    void api<{ items: Archive[] }>("/api/v1/history").then((result) => setItems(result.items)).finally(() => setBusy(false));
  }, [session, loading, navigate]);
  const search = async () => {
    if (!query.trim()) { const result = await api<{ items: Archive[] }>("/api/v1/history"); setItems(result.items); return; }
    const result = await api<{ items: Archive[] }>(`/api/v1/history/search?q=${encodeURIComponent(query)}`); setItems(result.items);
  };
  return <section className="page history-page">
    <header className="page-header"><div><p className="eyebrow">{t("history.eyebrow")}</p><h1>{t("history.title")}</h1></div><Link className="button primary" to="/">＋ {t("nav.cast")}</Link></header>
    <div className="search-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder={t("history.search")} /><button onClick={() => void search()} aria-label={t("history.searchLabel")}>⌕</button></div>
    {busy ? <p>{t("common.loading")}</p> : items.length === 0 ? <div className="empty-state"><span>☷</span><p>{t("history.empty")}</p></div> : <div className="history-grid">{items.map((item) => <Link className="history-card glass-panel" to={`/history/${item.id}`} key={item.id}><div className="history-symbols"><span>{item.facts.primary.unicodeSymbol}</span><i>→</i><span>{item.facts.relating.unicodeSymbol}</span></div><p className="eyebrow">{new Date(item.createdAt).toLocaleDateString(i18n.language)}</p><h2>{item.title || `${hexagramName(item.facts.primary, i18n.language)} → ${hexagramName(item.facts.relating, i18n.language)}`}</h2><p>{item.question || t("cast.noQuestion")}</p><span className="open-link">{t("history.open")} ↗</span></Link>)}</div>}
  </section>;
}
