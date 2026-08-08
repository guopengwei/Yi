import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { Hexagram, lineValuesForPattern } from "../components/Hexagram";
import { api } from "../lib/api";
import { hexagramName } from "../lib/hexagram-name";

interface Snapshot {
  facts: CastFacts;
  reflection: { summary: string; perspective: string; questionsToConsider: string[] } | null;
  expiresAt: string;
}

export function PublicSharePage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) return;
    const previous = robots.content;
    robots.content = "noindex,nofollow,noarchive";
    return () => { robots.content = previous; };
  }, []);
  useEffect(() => {
    if (token) void api<Snapshot>(`/api/v1/shares/public/${encodeURIComponent(token)}`).then(setSnapshot).catch(() => setMissing(true));
  }, [token]);
  if (missing) return <section className="page narrow empty-state"><span>☷</span><h1>{t("share.expired")}</h1><Link className="button primary" to="/">{t("hero.start")}</Link></section>;
  if (!snapshot) return <section className="page narrow"><p>{t("common.loading")}</p></section>;
  const { facts } = snapshot;
  const primaryName = hexagramName(facts.primary, i18n.language);
  const relatingName = hexagramName(facts.relating, i18n.language);
  return <article className="page public-share">
    <header><p className="eyebrow">{t("share.anonymous")}</p><h1>{primaryName} <span>→</span> {relatingName}</h1><p>{t("share.body")}</p></header>
    <div className="mini-pair glass-panel">
      <div><Hexagram lineValues={lineValuesForPattern(facts.primary.pattern)} label={primaryName} /><h2>{primaryName}</h2></div><span>→</span>
      <div><Hexagram lineValues={lineValuesForPattern(facts.relating.pattern)} label={relatingName} /><h2>{relatingName}</h2></div>
    </div>
    {snapshot.reflection && <section className="reflection-card glass-panel"><h2>{snapshot.reflection.summary}</h2><p>{snapshot.reflection.perspective}</p><ol>{snapshot.reflection.questionsToConsider.map((item) => <li key={item}>{item}</li>)}</ol></section>}
    <footer><p>{t("share.expires", { date: new Date(snapshot.expiresAt).toLocaleString(i18n.language) })}</p><Link className="button primary" to="/">{t("hero.start")}</Link></footer>
  </article>;
}
