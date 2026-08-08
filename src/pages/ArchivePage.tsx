import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { Hexagram, lineValuesForPattern } from "../components/Hexagram";
import { ReflectionArticle, type ReflectionArticleData } from "../components/ReflectionArticle";
import { ShareActions } from "../components/ShareActions";
import { api, postJson } from "../lib/api";
import { hexagramName } from "../lib/hexagram-name";

interface Note { id: string; body: string; createdAt: string; updatedAt: string }
interface Archive { id: string; title: string | null; question: string | null; facts: CastFacts; reflection: ReflectionArticleData | null; reflectionShareEligible: boolean; notes: Note[] }

export function ArchivePage() {
  const { id } = useParams(); const { t, i18n } = useTranslation(); const navigate = useNavigate();
  const [archive, setArchive] = useState<Archive | null>(null); const [note, setNote] = useState("");
  const load = async () => { if (id) setArchive(await api<Archive>(`/api/v1/history/${id}`)); };
  useEffect(() => { void load(); }, [id]);
  const add = async () => { if (!id || !note.trim()) return; await postJson(`/api/v1/history/${id}/notes`, { body: note }); setNote(""); await load(); };
  const deleteArchive = async () => { if (!id || !confirm(t("history.delete"))) return; await api(`/api/v1/history/${id}`, { method: "DELETE" }); navigate("/history"); };
  if (!archive) return <section className="page narrow"><p>{t("common.loading")}</p></section>;
  const primaryName = hexagramName(archive.facts.primary, i18n.language); const relatingName = hexagramName(archive.facts.relating, i18n.language);
  return <article className="page archive-page"><Link className="back-link" to="/history">← {t("history.title")}</Link><header className="result-header"><div><p className="eyebrow">{t("history.saved")}</p><h1>{archive.title || `${primaryName} → ${relatingName}`}</h1><p>{archive.question}</p></div><button className="button danger" onClick={() => void deleteArchive()}>{t("history.delete")}</button></header>
    <div className="mini-pair glass-panel"><div><Hexagram lineValues={lineValuesForPattern(archive.facts.primary.pattern)} label={primaryName} compact /><h2>{primaryName}</h2></div><span>→</span><div><Hexagram lineValues={lineValuesForPattern(archive.facts.relating.pattern)} label={relatingName} compact /><h2>{relatingName}</h2></div></div>
    {archive.reflection && <section className="standalone-reflection"><ReflectionArticle reflection={archive.reflection} /></section>}
    <section className="notes-section"><h2>{t("history.notes")}</h2><div className="note-compose"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={10000} placeholder={t("history.addNote")} /><button className="button primary" onClick={() => void add()}>{t("history.saveNote")}</button></div><div className="notes-list">{archive.notes.map((item) => <article className="note-card" key={item.id}><p>{item.body}</p><small>{new Date(item.updatedAt).toLocaleString()}</small><button onClick={() => void api(`/api/v1/history/${id}/notes/${item.id}`, { method: "DELETE" }).then(load)}>{t("history.delete")}</button></article>)}</div></section>
    <ShareActions archiveId={archive.id} facts={archive.facts} hasReflection={Boolean(archive.reflection) && archive.reflectionShareEligible} />
  </article>;
}
