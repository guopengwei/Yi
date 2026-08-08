import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function HelpPage() {
  const { t } = useTranslation();
  return <section className="page editorial-page">
    <header><p className="eyebrow">{t("help.eyebrow")}</p><h1>{t("help.title")}</h1></header>
    <div className="editorial-grid">
      <article className="lead-article"><p>{t("help.body1")}</p><p>{t("help.body2")}</p><Link className="button primary" to="/">{t("hero.start")}</Link></article>
      <aside>
        <div className="principle"><span>01</span><h2>{t("trust.deterministic")}</h2><p>{t("help.methods")}</p></div>
        <div className="principle"><span>02</span><h2>{t("trust.private")}</h2><p>{t("help.privacy")}</p></div>
        <div className="principle"><span>03</span><h2>{t("result.sourcePending")}</h2><p>{t("result.sourceBody")}</p></div>
      </aside>
    </div>
  </section>;
}
