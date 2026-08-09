import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TRIGRAMS } from "../../shared/catalog";
import type { LineValue } from "../../shared/casting";
import { lineValuesFromReading } from "../../shared/casting";
import { readingCreateSchema, type ReadingCreate } from "../../shared/contracts";
import { CastingStepHeader, StickyActionBar } from "../components/FlowPrimitives";
import { ContributionPanel } from "../components/ContributionPanel";
import { Hexagram } from "../components/Hexagram";
import { useMobileShell } from "../components/MobileShell";
import { postJson } from "../lib/api";

type Phase = "question" | "method" | "review" | "contribution";

const phases: Phase[] = ["question", "method", "review", "contribution"];
const trigramFromInput = (value: string) => TRIGRAMS.find((trigram) => trigram.number === Number(value));

export function HomePage() {
  const { t } = useTranslation();
  const composer = useRef<HTMLElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const upperInput = useRef<HTMLInputElement>(null);
  const lowerInput = useRef<HTMLInputElement>(null);
  const changingInput = useRef<HTMLInputElement>(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("question");
  const [question, setQuestion] = useState("");
  const [noQuestion, setNoQuestion] = useState(false);
  const [numbers, setNumbers] = useState({ upper: "", lower: "", changing: "" });
  const [prepared, setPrepared] = useState<ReadingCreate | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  useMobileShell(started ? "focused" : "normal");

  const currentStep = phases.indexOf(phase) + 1;
  const phaseTitle = phase === "question" ? t("cast.title") : phase === "method" ? t("cast.methodTitle") : phase === "review" ? t("cast.reviewTitle") : t("contribution.title");

  useEffect(() => {
    if (started) setLiveMessage(t("cast.stepChanged", { step: phaseTitle }));
  }, [phase, phaseTitle, started, t]);

  const enterCasting = () => {
    setStarted(true);
    window.requestAnimationFrame(() => composer.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const exitCasting = () => {
    setStarted(false);
    setError("");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const moveTo = (next: Phase) => {
    setError(""); setPhase(next);
    window.requestAnimationFrame(() => composer.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };
  const focusError = (target: HTMLElement | null) => {
    setError(t("cast.invalid"));
    window.requestAnimationFrame(() => target?.focus());
  };
  const continueFromQuestion = () => {
    if (!noQuestion && !question.trim()) { focusError(questionInput.current); return; }
    moveTo("method");
  };
  const buildRequest = (): ReadingCreate | null => {
    const base = {
      schemaVersion: "reading-create@1" as const,
      clientRequestId: crypto.randomUUID(),
      question: noQuestion ? { kind: "none" as const } : { kind: "question" as const, text: question.trim() },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Hong_Kong",
    };
    const candidate: unknown = {
      ...base,
      castingMethod: "three-number@1",
      inputs: {
        upperTrigram: Number(numbers.upper),
        lowerTrigram: Number(numbers.lower),
        changingPosition: Number(numbers.changing),
      },
    };
    const parsed = readingCreateSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  };
  const review = () => {
    if (!between(numbers.upper, 1, 8)) { focusError(upperInput.current); return; }
    if (!between(numbers.lower, 1, 8)) { focusError(lowerInput.current); return; }
    if (!between(numbers.changing, 1, 6)) { focusError(changingInput.current); return; }
    const request = buildRequest();
    if (!request) { focusError(upperInput.current); return; }
    setPrepared(request);
    moveTo("review");
  };
  const lineValues = useMemo(() => prepared ? lineValuesFromReading(prepared) : [], [prepared]);
  const submitReading = async () => {
    if (!prepared) return;
    setBusy(true); setError(""); setLiveMessage(t("common.loading"));
    try {
      const response = await postJson<{ id: string }>("/api/v1/readings", prepared);
      setReadingId(response.id); moveTo("contribution");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  };
  const goBack = phase === "method" ? () => moveTo("question") : phase === "review" ? () => moveTo("method") : undefined;

  return <div className={`home-page ${started ? "casting-started" : "casting-landing"}`}>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{String(t("hero.title")).split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p className="hero-body">{t("hero.body")}</p>
        <button className="button primary" onClick={enterCasting}>{phase === "question" ? t("hero.start") : t("cast.resume")}</button>
      </div>
      <div className="hero-visual">
        <picture>
          <source srcSet="/assets/yi-hero-king-wen-v3.webp" type="image/webp" />
          <img src="/assets/yi-hero-king-wen-v3.jpg" alt={t("hero.imageAlt")} width="1536" height="1024" fetchPriority="high" />
        </picture>
      </div>
    </section>

    <section className="feature-strip" aria-label={t("features.label")}>
      <article><strong>{t("features.methodsTitle")}</strong><span>{t("features.methodsBody")}</span></article>
      <article><strong>{t("features.interpretationTitle")}</strong><span>{t("features.interpretationBody")}</span></article>
      <article><strong>{t("features.chatTitle")}</strong><span>{t("features.chatBody")}</span></article>
    </section>

    <section className="composer-section" ref={composer}>
      <CastingStepHeader current={currentStep} title={phaseTitle} onBack={goBack} onClose={exitCasting} />
      <div className="composer-heading"><h2>{phaseTitle}</h2></div>
      <div className="progress" role="progressbar" aria-label={t("cast.progressLabel")} aria-valuemin={1} aria-valuemax={4} aria-valuenow={currentStep}>{phases.map((value, index) => <span key={value} className={index < currentStep ? "done" : ""} />)}</div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>

      {phase === "question" && <div className="glass-panel question-panel">
        <label className="field"><span>{t("cast.title")}</span><textarea ref={questionInput} maxLength={280} rows={5} value={question} disabled={noQuestion} aria-invalid={Boolean(error && !noQuestion && !question.trim())} placeholder={t("cast.questionHint")} onChange={(event) => { setQuestion(event.target.value); setError(""); }} /><small>{question.length}/280</small></label>
        <label className="check-row"><input type="checkbox" checked={noQuestion} onChange={(event) => { setNoQuestion(event.target.checked); setError(""); if (event.target.checked) setQuestion(""); }} /><span>{t("cast.noQuestion")}</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <StickyActionBar><button className="button primary" onClick={continueFromQuestion}>{t("cast.continue")} <span aria-hidden="true">→</span></button></StickyActionBar>
      </div>}

      {phase === "method" && <div className="method-layout">
        <div className="glass-panel method-config">
          <p className="method-lede">{t("cast.numberBody")}</p>
          <details className="method-explanation">
            <summary><span>{t("methodGuide.title")}</span><span className="method-explanation-icon" aria-hidden="true">＋</span></summary>
            <div>
              <p>{t("methodGuide.number.body")}</p>
              <ul>{["point1", "point2"].map((point) => <li key={point}>{t(`methodGuide.number.${point}`)}</li>)}</ul>
            </div>
          </details>
          <div className="number-fields">
            {([ ["upper", "cast.upper", upperInput], ["lower", "cast.lower", lowerInput] ] as const).map(([key, label, inputRef]) => {
              const trigram = trigramFromInput(numbers[key]);
              return <div className="trigram-field" key={key}>
                <label className="field">
                  <span>{t(label)}</span>
                  <input ref={inputRef} inputMode="numeric" min="1" max="8" value={numbers[key]} aria-invalid={Boolean(error && !between(numbers[key], 1, 8))} onChange={(event) => { setNumbers((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(0, 1) })); setError(""); }} />
                </label>
                <output className="trigram-preview" aria-live="polite" aria-atomic="true">
                  {trigram && <><span aria-hidden="true">{trigram.symbol}</span><strong>{t(`trigrams.${trigram.number}`)}</strong></>}
                </output>
              </div>;
            })}
            <label className="field changing-field"><span>{t("cast.changing")}</span><input ref={changingInput} inputMode="numeric" min="1" max="6" value={numbers.changing} aria-invalid={Boolean(error && !between(numbers.changing, 1, 6))} onChange={(event) => { setNumbers((current) => ({ ...current, changing: event.target.value.replace(/\D/g, "").slice(0, 1) })); setError(""); }} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <StickyActionBar><button className="button quiet desktop-flow-back" onClick={() => moveTo("question")}>← {t("common.back")}</button><button className="button primary" onClick={review}>{t("cast.review")}</button></StickyActionBar>
        </div>
      </div>}

      {phase === "review" && prepared && <div className="glass-panel review-panel">
        <div className="review-grid">
          <Hexagram lineValues={lineValues as LineValue[]} label={t("cast.reviewTitle")} />
          <div><p className="method-code">{prepared.castingMethod}</p><h3>{t("cast.reviewTitle")}</h3><p className="muted">{t("cast.bottomUp")}</p>
            <ol className="line-facts">{lineValues.map((value, index) => <li key={index} className={value === 6 || value === 9 ? "moving" : ""}><span>{index + 1}</span>{value === 7 || value === 9 ? t("cast.yang") : t("cast.yin")} · {value === 6 || value === 9 ? t("cast.moving") : t("cast.still")} <b>{value}</b></li>)}</ol>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <StickyActionBar><button className="button quiet desktop-flow-back" onClick={() => moveTo("method")}>← {t("cast.back")}</button><button className="button primary" disabled={busy} onClick={() => void submitReading()}>{busy ? t("common.loading") : t("cast.confirm")}</button></StickyActionBar>
      </div>}

      {phase === "contribution" && readingId && <ContributionPanel readingId={readingId} />}
    </section>
  </div>;
}

function between(value: string, min: number, max: number) {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(number) && number >= min && number <= max;
}
