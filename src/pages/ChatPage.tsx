import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMobileShell } from "../components/MobileShell";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

interface Message { seq: number; id: string; role: "user" | "assistant"; content: string; createdAt: string }

export function ChatPage() {
  const { id } = useParams(); const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const authenticated = Boolean(session);
  const [messages, setMessages] = useState<Message[]>([]); const [draft, setDraft] = useState(""); const [status, setStatus] = useState<"connecting" | "open">("connecting"); const [stream, setStream] = useState<{ seq: number; content: string } | null>(null);
  const socket = useRef<WebSocket | null>(null); const retry = useRef<number | null>(null); const lastSeq = useRef(0);
  const active = useRef(true); const log = useRef<HTMLDivElement>(null); const composer = useRef<HTMLTextAreaElement>(null);
  useMobileShell("focused");
  const connect = useCallback(() => {
    if (!id || !authenticated) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/v1/chats/${id}/socket?after=${lastSeq.current}`);
    socket.current = ws; setStatus("connecting");
    ws.onopen = () => setStatus("open");
    ws.onmessage = (event) => {
      const data = JSON.parse(String(event.data)) as { type: string; messages?: Message[]; message?: Message; seq?: number; delta?: string };
      if (data.messages) {
        setMessages((current) => mergeMessages(current, data.messages!));
        lastSeq.current = Math.max(lastSeq.current, ...data.messages.map((message) => message.seq), 0);
      }
      if (data.message) { setMessages((current) => mergeMessages(current, [data.message!])); lastSeq.current = Math.max(lastSeq.current, data.message.seq); }
      if (data.type === "stream-start" && data.seq) setStream({ seq: data.seq, content: "" });
      if (data.type === "stream-delta" && data.delta) setStream((current) => current ? { ...current, content: current.content + data.delta } : null);
      if (data.type === "stream-end") setStream(null);
    };
    ws.onclose = () => { if (active.current) { setStatus("connecting"); retry.current = window.setTimeout(connect, 1500); } };
  }, [authenticated, id]);
  useEffect(() => {
    if (loading) return;
    if (!authenticated) {
      navigate("/auth", { replace: true, state: { returnTo: id ? `/chat/${id}` : "/history" } });
      return;
    }
    active.current = true;
    connect();
    return () => {
      active.current = false;
      if (retry.current) clearTimeout(retry.current);
      socket.current?.close();
    };
  }, [authenticated, connect, id, loading, navigate]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, stream?.content]);
  const send = () => {
    if (!draft.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "message", id: crypto.randomUUID(), content: draft.trim() }));
    setDraft("");
    if (composer.current) composer.current.style.height = "auto";
  };
  const remove = async () => {
    if (!id || !confirm(t("chat.deleteConfirm"))) return;
    active.current = false;
    socket.current?.close();
    await api(`/api/v1/chats/${id}`, { method: "DELETE" });
    navigate("/history");
  };
  return <section className="chat-page page narrow">
    <header className="chat-header"><Link className="icon-button chat-back" to="/history" aria-label={t("common.back")}>←</Link><div><p className="eyebrow">{t("chat.eyebrow")}</p><h1>{t("chat.title")}</h1><p className={`connection-status ${status}`} role="status" aria-label={t("chat.statusLabel")}><span aria-hidden="true" />{status === "open" ? t("chat.connected") : t("chat.reconnecting")}</p></div><button className="icon-button chat-delete" aria-label={t("chat.delete")} onClick={() => void remove()}>⋯</button></header>
    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 && !stream && <div className="chat-empty"><span aria-hidden="true">易</span><p>{t("chat.empty")}</p></div>}
      {messages.map((message) => <article className={`chat-message ${message.role}`} key={message.seq}><span>{message.role === "assistant" ? "易" : t("chat.you")}</span><p>{message.content}</p></article>)}
      {stream && <article className="chat-message assistant streaming"><span>易</span><p>{stream.content}<i /></p></article>}
    </div>
    <div className="chat-compose"><textarea ref={composer} rows={1} value={draft} maxLength={4000} aria-label={t("chat.placeholder")} placeholder={t("chat.placeholder")} onChange={(event) => { setDraft(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="button primary" aria-label={t("chat.send")} disabled={status !== "open" || !draft.trim()} onClick={send}><span>{t("chat.send")}</span><b aria-hidden="true">↑</b></button></div>
  </section>;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) map.set(message.seq, message);
  return [...map.values()].sort((left, right) => left.seq - right.seq);
}
