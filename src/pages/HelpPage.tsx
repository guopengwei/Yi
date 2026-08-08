import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function HelpPage() {
  const { t } = useTranslation();
  return <section className="page editorial-page">
    <header><p className="eyebrow">{t("help.eyebrow")}</p><h1>{t("help.title")}</h1></header>
    <div className="editorial-grid">
      <article className="lead-article"><p>{t("help.body1")}</p><p>{t("help.body2")}</p><Link className="button primary" to="/">{t("hero.start")}</Link></article>
      <aside>
        <div className="principle"><h2>{t("trust.deterministic")}</h2><p>{t("help.methods")}</p></div>
        <div className="principle"><h2>{t("trust.private")}</h2><p>{t("help.privacy")}</p></div>
        <div className="principle"><h2>{t("result.sourcePending")}</h2><p>{t("result.sourceBody")}</p></div>
      </aside>
    </div>
    <section className="takashima-intro" aria-labelledby="takashima-title">
      <p className="eyebrow">{t("help.takashima.eyebrow")}</p>
      <div>
        <h2 id="takashima-title">{t("help.takashima.title")}</h2>
        <p>{t("help.takashima.body")}</p>
        <a href="https://ja.wikipedia.org/wiki/%E9%AB%98%E5%B3%B6%E5%98%89%E5%8F%B3%E8%A1%9B%E9%96%80" target="_blank" rel="noreferrer">{t("help.takashima.source")} <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </section>;
}
