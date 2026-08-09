import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
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
  aiConsentScope?: AiConsentScope | null;
  reflectionShareEligible?: boolean;
  safety?: { routed: boolean; limitations: string[] };
}

interface AiConsentScope {
  includeReadingFacts: true;
  includeQuestion: boolean;
  includeSourceMaterial: boolean;
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
  const [turnstile, setTurnstile] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAgreed, setChatAgreed] = useState(false);

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

  const reflection = async (scope?: AiConsentScope) => {
    if (!id || (!scope && !agreed)) return;
    const consentScope = scope ?? {
      includeReadingFacts: true as const,
      includeQuestion: true,
      includeSourceMaterial: Boolean(reading?.takashimaInterpretations?.length),
    };
    setBusy(true); setError("");
    try {
      await postJson(`/api/v1/readings/${id}/reflection`, {
        schemaVersion: "ai-consent@1",
        consent: true,
        ...consentScope,
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
  const startChat = async (scope?: AiConsentScope) => {
    if (!id || (!scope && !chatAgreed)) return;
    if (!session) { navigate("/auth", { state: { returnTo: `/reading/${id}` } }); return; }
    const consentScope = scope ?? {
      includeReadingFacts: true as const,
      includeQuestion: true,
      includeSourceMaterial: Boolean(reading?.takashimaInterpretations?.length),
    };
    setBusy(true);
    try {
      const response = await postJson<{ id: string; archiveId: string }>("/api/v1/chats", {
        readingId: id,
        consent: true,
        ...consentScope,
      }, { "Idempotency-Key": crypto.randomUUID() });
      setArchiveId(response.archiveId); navigate(`/chat/${response.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); setBusy(false); }
  };
  const openChat = () => {
    if (!id) return;
    if (!session) { navigate("/auth", { state: { returnTo: `/reading/${id}` } }); return; }
    if (reading?.aiConsentScope) { void startChat(reading.aiConsentScope); return; }
    setChatAgreed(false);
    setChatOpen(true);
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
        : !consentOpen ? <button className="button primary" disabled={busy} onClick={() => reading.aiConsentScope ? void reflection(reading.aiConsentScope) : setConsentOpen(true)}>{busy ? t("common.loading") : t(reading.aiConsentScope ? "consent.create" : "result.askReflection")}</button>
          : <ConsentCard agreed={agreed} onAgreementChange={setAgreed} onCancel={() => setConsentOpen(false)} onSubmit={() => void reflection()} submitLabel={busy ? t("common.loading") : t("consent.submit")} disabled={busy || (!session && !turnstile)}>{!session && <Turnstile action="guest_ai" onToken={setTurnstile} resetKey={turnstileReset} />}</ConsentCard>}
      </div>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="result-actions task-actions glass-panel">
      <div><h2>{session ? t("result.archive") : t("auth.needAccount")}</h2></div>
      <div className="button-row wrap"><button className="button secondary" disabled={busy || Boolean(archiveId)} onClick={() => void archive()}>{archiveId ? t("result.archived") : t("result.archive")}</button><button className="button primary" disabled={busy} onClick={openChat}>{busy ? t("common.loading") : t("result.chat")}</button></div>
    </section>
    {chatOpen && <ConsentCard agreed={chatAgreed} onAgreementChange={setChatAgreed} onCancel={() => setChatOpen(false)} onSubmit={() => void startChat()} submitLabel={busy ? t("common.loading") : t("consent.chatSubmit")} disabled={busy} />}
    {archiveId && <ShareActions archiveId={archiveId} facts={facts} hasReflection={Boolean(reading.reflection) && reading.reflectionShareEligible === true} />}
  </article>;
}

function ConsentCard({ agreed, onAgreementChange, onCancel, onSubmit, submitLabel, disabled, children }: {
  agreed: boolean;
  onAgreementChange: (agreed: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return <section className="consent-card glass-panel" aria-labelledby={titleId}>
    <h3 id={titleId}>{t("consent.title")}</h3>
    <p>{t("consent.body")}</p>
    <p className="consent-scope-title">{t("consent.scopeTitle")}</p>
    <ul className="consent-scope"><li>{t("consent.facts")}</li><li>{t("consent.question")}</li><li>{t("consent.sources")}</li></ul>
    <label className="check-row important"><input type="checkbox" checked={agreed} onChange={(event) => onAgreementChange(event.target.checked)} /><span>{t("consent.agree")}</span></label>
    {children}
    <div className="button-row"><button className="button quiet" onClick={onCancel}>{t("consent.decline")}</button><button className="button primary" disabled={!agreed || disabled} onClick={onSubmit}>{submitLabel}</button></div>
  </section>;
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
