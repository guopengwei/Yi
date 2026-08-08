import { useId, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function CastingStepHeader({ current, title, onBack, onClose }: { current: number; title: string; onBack?: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return <header className="casting-step-header">
    <div className="step-header-row">
      {onBack ? <button type="button" className="icon-button" onClick={onBack} aria-label={t("common.back")}><span aria-hidden="true">←</span></button> : <span className="step-header-spacer" />}
      <div><p>{t("cast.stepCount", { current, total: 4 })}</p><h2>{title}</h2></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label={t("cast.exit")}><span aria-hidden="true">×</span></button>
    </div>
    <div className="step-progress" role="progressbar" aria-label={t("cast.progressLabel")} aria-valuemin={1} aria-valuemax={4} aria-valuenow={current}>
      {Array.from({ length: 4 }, (_, index) => <span key={index} className={index < current ? "done" : ""} />)}
    </div>
  </header>;
}

export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sticky-action-bar ${className}`.trim()}>{children}</div>;
}

export function PageState({ kind, title, body, action, ref }: { kind: "loading" | "empty" | "error"; title: string; body?: string; action?: { label: string; to?: string; onClick?: () => void }; ref?: Ref<HTMLDivElement> }) {
  const id = useId();
  return <div className={`page-state ${kind}`} role={kind === "error" ? "alert" : "status"} aria-labelledby={id} aria-live={kind === "loading" ? "polite" : undefined} aria-busy={kind === "loading" || undefined} ref={ref}>
    <span className="state-mark" aria-hidden="true">{kind === "loading" ? <><i /><i /><i /></> : kind === "empty" ? "☷" : "!"}</span>
    <h2 id={id}>{title}</h2>
    {body && <p>{body}</p>}
    {action && (action.to ? <Link className="button secondary" to={action.to}>{action.label}</Link> : <button type="button" className="button secondary" onClick={action.onClick}>{action.label}</button>)}
  </div>;
}
