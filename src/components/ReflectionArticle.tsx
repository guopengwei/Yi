import { useId } from "react";
import { useTranslation } from "react-i18next";

export interface ReflectionArticleData {
  summary: string;
  perspective: string;
  questionsToConsider?: string[];
  cautions?: string[];
}

function paragraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function ReflectionArticle({ reflection }: { reflection: ReflectionArticleData }) {
  const { t } = useTranslation();
  const titleId = useId();
  const longSummary = Array.from(reflection.summary.trim()).length > 72;
  const perspective = paragraphs(reflection.perspective);
  const questions = reflection.questionsToConsider ?? [];
  const cautions = reflection.cautions ?? [];

  return <article className="reflection-article" aria-labelledby={titleId}>
    <header className={`reflection-summary${longSummary ? " long" : ""}`}>
      <h3 id={titleId}>{reflection.summary}</h3>
    </header>
    <div className="reflection-perspective">
      {perspective.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
    </div>
    {questions.length > 0 && <section className="reflection-prompts">
      <h4>{t("result.reflectionQuestions")}</h4>
      <ol>{questions.map((question) => <li key={question}>{question}</li>)}</ol>
    </section>}
    {cautions.length > 0 && <aside className="reflection-cautions" aria-label={t("result.reflectionCautions")}>
      <h4>{t("result.reflectionCautions")}</h4>
      {cautions.map((caution) => <p key={caution}>{caution}</p>)}
    </aside>}
  </article>;
}
