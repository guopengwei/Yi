import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { PageState } from "../components/FlowPrimitives";
import { ContributionPanel } from "../components/ContributionPanel";
import { Hexagram, lineValuesForPattern } from "../components/Hexagram";
import { ReflectionArticle, type ReflectionArticleData } from "../components/ReflectionArticle";
import { ShareActions } from "../components/ShareActions";
import { Turnstile } from "../components/Turnstile";
import { api, postJson } from "../lib/api";
import { useSession } from "../lib/session";
import { hexagramName } from "../lib/hexagram-name";

interface Reflection extends ReflectionArticleData { questionsToConsider: string[]; cautions: string[] }
interface TakashimaInterpretation {
  id: string;
  entryKey: string;
  text: string;
  provenance: { title: string; locator: string; sourceUrl?: string };
}
interface ReadingResponse {
  id: string;
  status: "awaiting_contribution" | "payment_pending" | "ready" | "failed" | "expired";
  contributionAmountHkd: number | null;
  createdAt: string;
  facts?: CastFacts;
  takashimaInterpretations?: TakashimaInterpretation[];
  reflection?: Reflection | null;
  reflectionShareEligible?: boolean;
  safety?: { routed: boolean; limitations: string[] };
}

export function ReadingPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session } = useSession();
  const [reading, setReading] = useState<ReadingResponse | null>(null);
  const [error, setError] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [includeSources, setIncludeSources] = useState(false);
  const [turnstile, setTurnstile] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAgreed, setChatAgreed] = useState(false);
  const [chatQuestion, setChatQuestion] = useState(false);
  const [chatSources, setChatSources] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setReading(await api<ReadingResponse>(`/api/v1/readings/${id}`)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
  }, [id, i18n.resolvedLanguage, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (reading?.status !== "payment_pending") return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [reading?.status, load]);

  const reflection = async () => {
    if (!id || !agreed) return;
    setBusy(true); setError("");
    try {
      await postJson(`/api/v1/readings/${id}/reflection`, {
        schemaVersion: "ai-consent@1",
        consent: true,
        includeReadingFacts: true,
        includeQuestion,
        includeSourceMaterial: includeSources,
        ...(!session ? { turnstileToken: turnstile } : {}),
      });
      setConsentOpen(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally {
      setBusy(false);
      if (!session) { setTurnstile(""); setTurnstileReset((value) => value + 1); }
    }
  };
  const archive = async () => {
    if (!id) return;
    if (!session) { navigate("/auth", { state: { returnTo: `/reading/${id}` } }); return; }
    setBusy(true);
    try { const response = await postJson<{ archiveId: string }>(`/api/v1/readings/${id}/archive`, {}); setArchiveId(response.archiveId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  };
  const openChat = () => {
    setChatAgreed(Boolean(reading?.reflection));
    setChatOpen(true);
  };
  const startChat = async () => {
    if (!id || !chatAgreed) return;
    if (!session) { navigate("/auth", { state: { returnTo: `/reading/${id}` } }); return; }
    setBusy(true);
    try {
      const response = await postJson<{ id: string; archiveId: string }>("/api/v1/chats", {
        readingId: id,
        consent: true,
        includeReadingFacts: true,
        includeQuestion: chatQuestion,
        includeSourceMaterial: chatSources,
      }, { "Idempotency-Key": crypto.randomUUID() });
      setArchiveId(response.archiveId); navigate(`/chat/${response.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); setBusy(false); }
  };

  if (error && !reading) return <section className="page narrow"><PageState kind="error" title={t("common.error")} body={error} action={{ label: t("common.retry"), onClick: () => void load() }} /></section>;
  if (!reading) return <section className="page narrow"><PageState kind="loading" title={t("common.loadingTitle")} body={t("common.loading")} /></section>;
  const cancelled = searchParams.get("checkout") === "cancelled";
  if (reading.status === "awaiting_contribution" || cancelled) return <section className="page narrow"><ContributionPanel readingId={reading.id} cancelled={cancelled} /></section>;
  if (reading.status !== "ready" || !reading.facts) return <section className="page narrow payment-wait" aria-live="polite" aria-busy="true"><div className="waiting-orbit"><span /><span /></div><p className="eyebrow">Stripe / webhook</p><h1>{t("result.waiting")}</h1><p>{t("result.waitingBody")}</p><p className="status-pill">{t("contribution.pending")}</p></section>;
  const facts = reading.facts;
  const takashimaInterpretations = reading.takashimaInterpretations ?? [];
  const primaryName = hexagramName(facts.primary, i18n.language);
  const relatingName = hexagramName(facts.relating, i18n.language);
  return <article className="result-page page">
    <header className="result-header">
      <div><p className="eyebrow">Reading / {facts.cast.castingMethod}</p><h1>{primaryName} <span>→</span> {relatingName}</h1><p className="muted">{t("result.facts")} · {new Date(reading.createdAt).toLocaleDateString(i18n.language)}</p></div>
      <Link className="button quiet" to="/">↻ {t("result.again")}</Link>
    </header>
    {reading.safety?.routed && <aside className="safety-card" aria-label="Safety guidance">{reading.safety.limitations.map((item) => <p key={item}>{item}</p>)}</aside>}
    <section className="hexagram-pair glass-panel facts-summary" aria-label={t("result.facts")}>
      <div className="hex-card"><p>{t("result.primary")}</p><span className="hex-symbol">{facts.primary.unicodeSymbol}</span><Hexagram lineValues={lineValuesForPattern(facts.primary.pattern)} label={primaryName} /><h2>{primaryName}</h2><small>{t("result.kingWenOrder")} · {facts.primary.kingWenNumber}</small></div>
      <div className="change-arrow" aria-hidden>↗</div>
      <div className="hex-card"><p>{t("result.relating")}</p><span className="hex-symbol">{facts.relating.unicodeSymbol}</span><Hexagram lineValues={lineValuesForPattern(facts.relating.pattern)} label={relatingName} /><h2>{relatingName}</h2><small>{t("result.kingWenOrder")} · {facts.relating.kingWenNumber}</small></div>
    </section>
    <section className="facts-grid">
      <div className="glass-subpanel"><p className="eyebrow">{t("result.movingLines")}</p><div className="moving-chips">{facts.movingLines.length ? facts.movingLines.map((line) => <span key={line.position}>{i18n.language === "en" ? `${t("cast.line", { n: line.position })} · ${t(line.yinYang === "yin" ? "cast.yin" : "cast.yang")}` : line.lineKey}</span>) : <span>{t("result.none")}</span>}</div>{facts.specialLine && <p>{t(facts.specialLine.lineKey === "用九" ? "specialLine.nine" : "specialLine.six")}</p>}</div>
      <div className="glass-subpanel source-status"><p className="eyebrow">{t(facts.sourceStatus === "reviewed" ? "result.sourceReviewed" : "result.sourcePending")}</p><p>{t(facts.sourceStatus === "reviewed" ? "result.sourceReviewedBody" : "result.sourceBody")}</p></div>
    </section>
    {takashimaInterpretations.length > 0 && <section className="reflection-section takashima-section" aria-labelledby="takashima-interpretation-title">
      <header className="reflection-heading"><p className="eyebrow">{t("result.takashimaEyebrow")}</p><h2 id="takashima-interpretation-title">{t("result.takashimaTitle")}</h2></header>
      <div className="takashima-content">
        <p className="takashima-introduction">{t("result.takashimaBody")}</p>
        {takashimaInterpretations.map((source, index) => {
          const position = Number(source.entryKey.split(":").at(-1));
          const movingLine = facts.movingLines.find((line) => line.position === position);
          const label = i18n.language === "en" ? t("cast.line", { n: position }) : movingLine?.lineKey ?? t("result.movingLines");
          const headingId = `takashima-source-${index}`;
          return <article className="takashima-excerpt" aria-labelledby={headingId} key={source.id}>
            <h3 id={headingId}>{label}</h3>
            <TakashimaSourceText text={source.text} />
            <footer><span>{t("result.takashimaSource")}</span> {source.provenance.sourceUrl
              ? <a href={source.provenance.sourceUrl} target="_blank" rel="noreferrer">{source.provenance.title}</a>
              : source.provenance.title} · {source.provenance.locator}</footer>
          </article>;
        })}
        <p className="takashima-caution">{t("result.takashimaCaution")}</p>
      </div>
    </section>}
    <section className="reflection-section">
      <header className="reflection-heading"><p className="eyebrow">Optional / DeepSeek</p><h2>{t("result.reflection")}</h2></header>
      <div className="reflection-content">{reading.reflection ? <ReflectionArticle reflection={reading.reflection} />
        : !consentOpen ? <button className="button primary" onClick={() => setConsentOpen(true)}>{t("result.askReflection")}</button>
          : <div className="consent-card glass-panel"><h3>{t("consent.title")}</h3><p>{t("consent.body")}</p><label className="check-row important"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>{t("consent.facts")}</span></label><label className="check-row"><input type="checkbox" checked={includeQuestion} onChange={(event) => setIncludeQuestion(event.target.checked)} /><span>{t("consent.question")}</span></label><label className="check-row"><input type="checkbox" checked={includeSources} onChange={(event) => setIncludeSources(event.target.checked)} /><span>{t("consent.sources")}</span></label>{!session && <Turnstile action="guest_ai" onToken={setTurnstile} resetKey={turnstileReset} />}<div className="button-row"><button className="button quiet" onClick={() => setConsentOpen(false)}>{t("consent.decline")}</button><button className="button primary" disabled={!agreed || busy || (!session && !turnstile)} onClick={() => void reflection()}>{busy ? t("common.loading") : t("consent.submit")}</button></div></div>}
      </div>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="result-actions task-actions glass-panel">
      <div><h2>{session ? t("result.archive") : t("auth.needAccount")}</h2></div>
      <div className="button-row wrap"><button className="button secondary" disabled={busy || Boolean(archiveId)} onClick={() => void archive()}>{archiveId ? t("result.archived") : t("result.archive")}</button><button className="button primary" onClick={openChat}>{t("result.chat")}</button></div>
    </section>
    {chatOpen && <section className="consent-card glass-panel"><h3>{t("consent.title")}</h3><p>{t("chat.intro")}</p><label className="check-row important"><input type="checkbox" checked={chatAgreed} onChange={(event) => setChatAgreed(event.target.checked)} /><span>{t("consent.facts")}</span></label><label className="check-row"><input type="checkbox" checked={chatQuestion} onChange={(event) => setChatQuestion(event.target.checked)} /><span>{t("consent.question")}</span></label><label className="check-row"><input type="checkbox" checked={chatSources} onChange={(event) => setChatSources(event.target.checked)} /><span>{t("consent.sources")}</span></label><div className="button-row"><button className="button quiet" onClick={() => setChatOpen(false)}>{t("common.cancel")}</button><button className="button primary" disabled={!chatAgreed || busy} onClick={() => void startChat()}>{t("result.chat")}</button></div></section>}
    {archiveId && <ShareActions archiveId={archiveId} facts={facts} hasReflection={Boolean(reading.reflection) && reading.reflectionShareEligible === true} />}
  </article>;
}

type TakashimaTextBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

function TakashimaSourceText({ text }: { text: string }) {
  const blocks: TakashimaTextBlock[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length > 0) blocks.push({ kind: "list", items: listItems });
    listItems = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flushList(); continue; }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const listItem = line.match(/^[*+-]\s+(.+)$/);
    if (listItem) { listItems.push(listItem[1]!.trim()); continue; }
    flushList();
    blocks.push(heading ? { kind: "heading", text: heading[1]!.trim() } : { kind: "paragraph", text: line });
  }
  flushList();
  return <div className="takashima-source-text">{blocks.map((block, index) => block.kind === "heading"
    ? <h4 key={index}>{block.text}</h4>
    : block.kind === "paragraph" ? <p key={index}>{block.text}</p>
      : <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>)}</div>;
}
