import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { PageState } from "../components/FlowPrimitives";
import { api } from "../lib/api";
import { hexagramName } from "../lib/hexagram-name";
import { useSession } from "../lib/session";

interface Archive { id: string; title: string | null; question: string | null; facts: CastFacts; createdAt: string }

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [items, setItems] = useState<Archive[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (searchQuery = "") => {
    setBusy(true); setError("");
    try {
      const endpoint = searchQuery.trim() ? `/api/v1/history/search?q=${encodeURIComponent(searchQuery.trim())}` : "/api/v1/history";
      const result = await api<{ items: Archive[] }>(endpoint);
      setItems(result.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  }, [t]);
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate("/auth", { replace: true }); return; }
    void load();
  }, [session, loading, navigate, load]);
  const search = () => void load(query);
  return <section className="page history-page">
    <header className="page-header"><div><p className="eyebrow">{t("history.eyebrow")}</p><h1>{t("history.title")}</h1></div><Link className="button primary" to="/">＋ {t("nav.cast")}</Link></header>
    <form className="search-bar" role="search" onSubmit={(event) => { event.preventDefault(); search(); }}><label className="sr-only" htmlFor="history-search">{t("history.searchLabel")}</label><input id="history-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("history.search")} /><button type="submit" aria-label={t("history.searchLabel")}>⌕</button></form>
    {busy ? <PageState kind="loading" title={t("common.loadingTitle")} body={t("common.loading")} />
      : error ? <PageState kind="error" title={t("common.error")} body={error} action={{ label: t("common.retry"), onClick: search }} />
        : items.length === 0 ? <PageState kind="empty" title={query.trim() ? t("history.noMatches") : t("history.emptyTitle")} body={query.trim() ? undefined : t("history.empty")} action={query.trim() ? { label: t("common.back"), onClick: () => { setQuery(""); void load(); } } : { label: t("hero.start"), to: "/" }} />
          : <div className="history-grid">{items.map((item) => <Link className="history-card glass-panel" to={`/history/${item.id}`} key={item.id}><div className="history-symbols" aria-hidden="true"><span>{item.facts.primary.unicodeSymbol}</span><i>→</i><span>{item.facts.relating.unicodeSymbol}</span></div><p className="eyebrow">{new Date(item.createdAt).toLocaleDateString(i18n.language)}</p><h2>{item.title || `${hexagramName(item.facts.primary, i18n.language)} → ${hexagramName(item.facts.relating, i18n.language)}`}</h2><p>{item.question || t("cast.noQuestion")}</p><span className="open-link">{t("history.open")} ↗</span></Link>)}</div>}
  </section>;
}
