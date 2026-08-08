import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TRIGRAMS } from "../../shared/catalog";
import type { LineValue } from "../../shared/casting";
import { createSecureRandomDraft, lineValuesFromReading } from "../../shared/casting";
import { readingCreateSchema, type CastingMethod, type ReadingCreate } from "../../shared/contracts";
import { ContributionPanel } from "../components/ContributionPanel";
import { Hexagram } from "../components/Hexagram";
import { postJson } from "../lib/api";

type Face = "heads" | "tails" | null;
type Phase = "question" | "method" | "review" | "contribution";

const trigramFromInput = (value: string) => TRIGRAMS.find((trigram) => trigram.number === Number(value));

export function HomePage() {
  const { t } = useTranslation();
  const composer = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("question");
  const [question, setQuestion] = useState("");
  const [noQuestion, setNoQuestion] = useState(false);
  const [method, setMethod] = useState<CastingMethod>("three-number@1");
  const [numbers, setNumbers] = useState({ upper: "", lower: "", changing: "" });
  const [throws, setThrows] = useState<Face[][]>(() => Array.from({ length: 6 }, () => [null, null, null]));
  const [randomDraft, setRandomDraft] = useState<Awaited<ReturnType<typeof createSecureRandomDraft>> | null>(null);
  const [prepared, setPrepared] = useState<ReadingCreate | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scrollToComposer = () => composer.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const buildRequest = (): ReadingCreate | null => {
    const base = {
      schemaVersion: "reading-create@1" as const,
      clientRequestId: crypto.randomUUID(),
      question: noQuestion ? { kind: "none" as const } : { kind: "question" as const, text: question.trim() },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Hong_Kong",
    };
    const candidate: unknown = method === "three-number@1"
      ? { ...base, castingMethod: method, inputs: { upperTrigram: Number(numbers.upper), lowerTrigram: Number(numbers.lower), changingPosition: Number(numbers.changing) } }
      : method === "three-coin@1"
        ? { ...base, castingMethod: method, inputs: { throws } }
        : { ...base, castingMethod: method, inputs: randomDraft };
    const parsed = readingCreateSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  };
  const review = () => {
    const request = buildRequest();
    if (!request) { setError(t("cast.invalid")); return; }
    setPrepared(request); setError(""); setPhase("review");
  };
  const lineValues = useMemo(() => prepared ? lineValuesFromReading(prepared) : [], [prepared]);
  const guideKey = method === "three-number@1" ? "number" : method === "three-coin@1" ? "coin" : "random";
  const guidePoints = guideKey === "number" ? ["point1", "point2"] : ["point1", "point2", "point3"];
  const submitReading = async () => {
    if (!prepared) return;
    setBusy(true); setError("");
    try {
      const response = await postJson<{ id: string }>("/api/v1/readings", prepared);
      setReadingId(response.id); setPhase("contribution");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  };
  const setCoin = (line: number, coin: number, face: Exclude<Face, null>) => setThrows((current) => current.map((row, rowIndex) =>
    rowIndex === line ? row.map((value, coinIndex) => coinIndex === coin ? face : value) : row,
  ));

  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{String(t("hero.title")).split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p className="hero-body">{t("hero.body")}</p>
        <button className="button primary" onClick={scrollToComposer}>{t("hero.start")}</button>
      </div>
      <div className="hero-visual">
        <picture>
          <source srcSet="/assets/yi-hero-king-wen-v3.webp" type="image/webp" />
          <img src="/assets/yi-hero-king-wen-v3.jpg" alt={t("hero.imageAlt")} width="1536" height="1024" fetchPriority="high" />
        </picture>
      </div>
    </section>

    <section className="trust-strip" aria-label={t("trust.label")}>
      <strong>{t("trust.deterministic")}</strong>
      <strong>{t("trust.reviewed")}</strong>
      <div><strong>{t("trust.private")}</strong><span>{t("hero.privacy")}</span></div>
    </section>

    <section className="composer-section" ref={composer}>
      <div className="composer-heading"><h2>{phase === "question" ? t("cast.title") : phase === "method" ? t("cast.methodTitle") : phase === "review" ? t("cast.reviewTitle") : t("contribution.title")}</h2></div>
      <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={phase === "question" ? 1 : phase === "method" ? 2 : phase === "review" ? 3 : 4}><span className="done" /><span className={phase !== "question" ? "done" : ""} /><span className={phase === "review" || phase === "contribution" ? "done" : ""} /></div>

      {phase === "question" && <div className="glass-panel question-panel">
        <label className="field"><span>{t("cast.title")}</span><textarea maxLength={280} rows={5} value={question} disabled={noQuestion} placeholder={t("cast.questionHint")} onChange={(event) => setQuestion(event.target.value)} /><small>{question.length}/280</small></label>
        <label className="check-row"><input type="checkbox" checked={noQuestion} onChange={(event) => { setNoQuestion(event.target.checked); if (event.target.checked) setQuestion(""); }} /><span>{t("cast.noQuestion")}</span></label>
        <button className="button primary" disabled={!noQuestion && !question.trim()} onClick={() => setPhase("method")}>{t("cast.continue")} <span>→</span></button>
      </div>}

      {phase === "method" && <div className="method-layout">
        <div className="method-tabs" role="tablist">
          {(["three-number@1", "three-coin@1", "secure-random@1"] as CastingMethod[]).map((value, index) => <button role="tab" aria-selected={method === value} key={value} onClick={() => setMethod(value)}>
            <span>0{index + 1}</span><strong>{t(value === "three-number@1" ? "cast.number" : value === "three-coin@1" ? "cast.coin" : "cast.random")}</strong>
          </button>)}
        </div>
        <div className="glass-panel method-config">
          <p>{t(method === "three-number@1" ? "cast.numberBody" : method === "three-coin@1" ? "cast.coinBody" : "cast.randomBody")}</p>
          <details className="method-explanation">
            <summary><span>{t("methodGuide.title")}</span><span className="method-explanation-icon" aria-hidden="true">＋</span></summary>
            <div>
              <p>{t(`methodGuide.${guideKey}.body`)}</p>
              <ul>{guidePoints.map((point) => <li key={point}>{t(`methodGuide.${guideKey}.${point}`)}</li>)}</ul>
            </div>
          </details>
          {method === "three-number@1" && <div className="number-fields">
            {([["upper", "cast.upper"], ["lower", "cast.lower"]] as const).map(([key, label]) => {
              const trigram = trigramFromInput(numbers[key]);
              return <div className="trigram-field" key={key}>
                <label className="field">
                  <span>{t(label)}</span>
                  <input inputMode="numeric" min="1" max="8" value={numbers[key]} onChange={(event) => setNumbers((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, "").slice(0, 1) }))} />
                </label>
                <output className="trigram-preview" aria-live="polite" aria-atomic="true">
                  {trigram && <><span aria-hidden="true">{trigram.symbol}</span><strong>{t(`trigrams.${trigram.number}`)}</strong></>}
                </output>
              </div>;
            })}
            <label className="field"><span>{t("cast.changing")}</span><input inputMode="numeric" min="1" max="6" value={numbers.changing} onChange={(event) => setNumbers((current) => ({ ...current, changing: event.target.value.replace(/\D/g, "").slice(0, 1) }))} /></label>
          </div>}
          {method === "three-coin@1" && <div className="coin-grid">
            {throws.map((row, line) => <div className="coin-row" key={line}><span>{line === 0 ? t("cast.bottom") : line === 5 ? t("cast.top") : t("cast.line", { n: line + 1 })}</span><div>{row.map((face, coin) => <button type="button" className={`coin ${face ?? ""}`} key={coin} onClick={() => setCoin(line, coin, face === "heads" ? "tails" : "heads")}>{face === "tails" ? t("cast.tails") : t("cast.heads")}</button>)}</div></div>)}
          </div>}
          {method === "secure-random@1" && <div className="random-box">
            {randomDraft ? <Hexagram lineValues={randomDraft.lineValues} label="Secure random cast preview" /> : <div className="random-placeholder"><span>☰</span><span>☷</span></div>}
            <button className="button secondary" onClick={() => void createSecureRandomDraft().then(setRandomDraft)}>{randomDraft ? t("cast.regenerate") : t("cast.generate")}</button>
            {randomDraft && <code>{randomDraft.entropyCommitment.slice(0, 31)}…</code>}
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="button-row"><button className="button quiet" onClick={() => setPhase("question")}>← {t("common.back")}</button><button className="button primary" onClick={review}>{t("cast.review")}</button></div>
        </div>
      </div>}

      {phase === "review" && prepared && <div className="glass-panel review-panel">
        <div className="review-grid">
          <Hexagram lineValues={lineValues as LineValue[]} label="Cast lines bottom to top" />
          <div><p className="method-code">{prepared.castingMethod}</p><h3>{t("cast.reviewTitle")}</h3><p className="muted">{t("cast.bottomUp")}</p>
            <ol className="line-facts">{lineValues.map((value, index) => <li key={index} className={value === 6 || value === 9 ? "moving" : ""}><span>{index + 1}</span>{value === 7 || value === 9 ? t("cast.yang") : t("cast.yin")} · {value === 6 || value === 9 ? t("cast.moving") : t("cast.still")} <b>{value}</b></li>)}</ol>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="button-row"><button className="button quiet" onClick={() => setPhase("method")}>← {t("cast.back")}</button><button className="button primary" disabled={busy} onClick={() => void submitReading()}>{busy ? t("common.loading") : t("cast.confirm")}</button></div>
      </div>}

      {phase === "contribution" && readingId && <ContributionPanel readingId={readingId} />}
    </section>
  </>;
}
