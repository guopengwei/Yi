import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface Message { seq: number; id: string; role: "user" | "assistant"; content: string; createdAt: string }

export function ChatPage() {
  const { id } = useParams(); const { t } = useTranslation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]); const [draft, setDraft] = useState(""); const [status, setStatus] = useState("connecting"); const [stream, setStream] = useState<{ seq: number; content: string } | null>(null);
  const socket = useRef<WebSocket | null>(null); const retry = useRef<number | null>(null); const lastSeq = useRef(0);
  const active = useRef(true);
  const connect = useCallback(() => {
    if (!id) return;
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
  }, [id]);
  useEffect(() => { active.current = true; connect(); return () => { active.current = false; if (retry.current) clearTimeout(retry.current); socket.current?.close(); }; }, [connect]);
  const send = () => { if (!draft.trim() || socket.current?.readyState !== WebSocket.OPEN) return; socket.current.send(JSON.stringify({ type: "message", id: crypto.randomUUID(), content: draft.trim() })); setDraft(""); };
  const remove = async () => {
    if (!id || !confirm(t("chat.deleteConfirm"))) return;
    active.current = false;
    socket.current?.close();
    await api(`/api/v1/chats/${id}`, { method: "DELETE" });
    navigate("/history");
  };
  return <section className="chat-page page narrow"><header><Link to="/history">← {t("history.title")}</Link><p className="eyebrow">{t("chat.eyebrow")}</p><h1>{t("chat.title")}</h1><p>{t("chat.intro")}</p><button className="button danger" onClick={() => void remove()}>{t("chat.delete")}</button></header><div className="chat-log" aria-live="polite">{messages.map((message) => <div className={`chat-message ${message.role}`} key={message.seq}><span>{message.role === "assistant" ? "易" : t("chat.you")}</span><p>{message.content}</p></div>)}{stream && <div className="chat-message assistant streaming"><span>易</span><p>{stream.content}<i /></p></div>}</div><div className="chat-compose"><textarea value={draft} maxLength={4000} placeholder={t("chat.placeholder")} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="button primary" disabled={status !== "open" || !draft.trim()} onClick={send}>{status === "open" ? t("chat.send") : t("chat.reconnecting")}</button></div></section>;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) map.set(message.seq, message);
  return [...map.values()].sort((left, right) => left.seq - right.seq);
}
