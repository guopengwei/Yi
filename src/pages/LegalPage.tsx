import { useTranslation } from "react-i18next";
import { legalContent } from "../legal-content";
import type { AppLocale } from "../i18n";

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { i18n } = useTranslation();
  const locale = (i18n.language in legalContent ? i18n.language : "zh-HK") as AppLocale;
  const document = legalContent[locale][kind];
  return <section className="page narrow legal-page">
    <header>
      <p className="eyebrow">{document.eyebrow}</p>
      <h1>{document.title}</h1>
      <p className="legal-date">{document.updated}</p>
      <p className="legal-intro">{document.intro}</p>
    </header>
    <div className="legal-sections">
      {document.sections.map((section, index) => <section key={section.title}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>)}
    </div>
  </section>;
}

export function PrivacyPage() { return <LegalPage kind="privacy" />; }
export function TermsPage() { return <LegalPage kind="terms" />; }
