import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CastFacts } from "../../shared/casting";
import { PageState } from "../components/FlowPrimitives";
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
  const [error, setError] = useState(""); const [busy, setBusy] = useState(true); const [noteBusy, setNoteBusy] = useState(false); const [status, setStatus] = useState("");
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true); setError("");
    try { setArchive(await api<Archive>(`/api/v1/history/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    if (!id || !note.trim()) { noteInput.current?.focus(); return; }
    setNoteBusy(true); setError(""); setStatus("");
    try { await postJson(`/api/v1/history/${id}/notes`, { body: note }); setNote(""); setStatus(t("history.noteSaved")); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setNoteBusy(false); }
  };
  const deleteArchive = async () => {
    if (!id || !confirm(t("history.deleteConfirm"))) return;
    try { await api(`/api/v1/history/${id}`, { method: "DELETE" }); navigate("/history"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
  };
  const deleteNote = async (noteId: string) => {
    if (!id || !confirm(t("history.delete"))) return;
    try { await api(`/api/v1/history/${id}/notes/${noteId}`, { method: "DELETE" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
  };
  if (busy && !archive) return <section className="page narrow"><PageState kind="loading" title={t("common.loadingTitle")} body={t("common.loading")} /></section>;
  if (error && !archive) return <section className="page narrow"><PageState kind="error" title={t("common.error")} body={error} action={{ label: t("common.retry"), onClick: () => void load() }} /></section>;
  if (!archive) return null;
  const primaryName = hexagramName(archive.facts.primary, i18n.language); const relatingName = hexagramName(archive.facts.relating, i18n.language);
  return <article className="page archive-page"><Link className="back-link" to="/history">← {t("history.title")}</Link><header className="result-header"><div><p className="eyebrow">{t("history.saved")}</p><h1>{archive.title || `${primaryName} → ${relatingName}`}</h1>{archive.question && <p>{archive.question}</p>}</div></header>
    <div className="mini-pair glass-panel"><div><Hexagram lineValues={lineValuesForPattern(archive.facts.primary.pattern)} label={primaryName} compact /><h2>{primaryName}</h2></div><span aria-hidden="true">→</span><div><Hexagram lineValues={lineValuesForPattern(archive.facts.relating.pattern)} label={relatingName} compact /><h2>{relatingName}</h2></div></div>
    {archive.reflection && <section className="standalone-reflection"><ReflectionArticle reflection={archive.reflection} /></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="notes-section"><h2>{t("history.notes")}</h2><div className="note-compose"><textarea ref={noteInput} rows={1} value={note} onChange={(event) => { setNote(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`; }} maxLength={10000} placeholder={t("history.addNote")} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void add(); } }} /><button className="button primary" disabled={noteBusy || !note.trim()} onClick={() => void add()}>{noteBusy ? t("common.loading") : t("history.saveNote")}</button></div>{status && <p className="small-status" role="status">{status}</p>}<div className="notes-list">{archive.notes.map((item) => <article className="note-card" key={item.id}><p>{item.body}</p><small>{new Date(item.updatedAt).toLocaleString(i18n.language)}</small><button aria-label={`${t("history.delete")}: ${item.body.slice(0, 40)}`} onClick={() => void deleteNote(item.id)}>{t("history.delete")}</button></article>)}</div></section>
    <ShareActions archiveId={archive.id} facts={archive.facts} hasReflection={Boolean(archive.reflection) && archive.reflectionShareEligible} />
    <div className="archive-danger-zone"><button className="button danger" onClick={() => void deleteArchive()}>{t("history.deleteReading")}</button></div>
  </article>;
}
