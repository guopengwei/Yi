import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMobileShell } from "../components/MobileShell";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

interface Message {
  seq: number;
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

type TurnPhase = "sending" | "thinking" | "streaming" | "failed";

interface ActiveTurn {
  id: string;
  content: string;
  phase: TurnPhase;
  userSeq?: number;
}

interface SocketEvent {
  type: string;
  messages?: Message[];
  message?: Message;
  seq?: number;
  delta?: string;
}

export function ChatPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const authenticated = Boolean(session);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"connecting" | "open">("connecting");
  const [stream, setStream] = useState<{ seq: number; content: string } | null>(null);
  const [activeTurn, setActiveTurn] = useState<ActiveTurn | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const retry = useRef<number | null>(null);
  const lastSeq = useRef(0);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const active = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useMobileShell("focused");

  const updateActiveTurn = useCallback((next: ActiveTurn | null) => {
    activeTurnRef.current = next;
    setActiveTurn(next);
  }, []);

  const receiveMessages = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => mergeMessages(current, incoming));
    lastSeq.current = Math.max(lastSeq.current, ...incoming.map((message) => message.seq));

    const currentTurn = activeTurnRef.current;
    if (!currentTurn) return;
    const acknowledged = incoming.find((message) => message.role === "user" && message.id === currentTurn.id);
    const userSeq = acknowledged?.seq ?? currentTurn.userSeq;
    const replied = userSeq !== undefined && incoming.some((message) => message.role === "assistant" && message.seq > userSeq);
    if (replied) {
      updateActiveTurn(null);
    } else if (acknowledged) {
      updateActiveTurn({ ...currentTurn, phase: "thinking", userSeq: acknowledged.seq });
    }
  }, [updateActiveTurn]);

  const connect = useCallback(() => {
    if (!id || !authenticated) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/v1/chats/${id}/socket?after=${lastSeq.current}`);
    socket.current = ws;
    setStatus("connecting");
    ws.onopen = () => setStatus("open");
    ws.onmessage = (event) => {
      let data: SocketEvent;
      try {
        data = JSON.parse(String(event.data)) as SocketEvent;
      } catch {
        return;
      }
      if (data.messages) receiveMessages(data.messages);
      if (data.message) receiveMessages([data.message]);
      if (data.type === "stream-start" && data.seq !== undefined) {
        setStream({ seq: data.seq, content: "" });
        const currentTurn = activeTurnRef.current;
        if (currentTurn) updateActiveTurn({ ...currentTurn, phase: "streaming" });
      }
      if (data.type === "stream-delta" && data.delta) {
        setStream((current) => current ? { ...current, content: current.content + data.delta } : null);
      }
      if (data.type === "stream-end") {
        setStream(null);
        updateActiveTurn(null);
      }
      if (data.type === "error") {
        const currentTurn = activeTurnRef.current;
        if (currentTurn) updateActiveTurn({ ...currentTurn, phase: "failed" });
      }
    };
    ws.onclose = () => {
      if (active.current) {
        setStatus("connecting");
        retry.current = window.setTimeout(connect, 1500);
      }
    };
  }, [authenticated, id, receiveMessages, updateActiveTurn]);

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

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [activeTurn?.phase, messages, stream?.content]);

  const sendTurn = (turn: ActiveTurn) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return;
    const sendingTurn = { ...turn, phase: "sending" as const };
    updateActiveTurn(sendingTurn);
    try {
      socket.current.send(JSON.stringify({ type: "message", id: turn.id, content: turn.content, locale: i18n.language }));
    } catch {
      updateActiveTurn({ ...turn, phase: "failed" });
    }
  };

  const send = () => {
    const content = draft.trim();
    if (!content || socket.current?.readyState !== WebSocket.OPEN || activeTurnRef.current) return;
    const turn: ActiveTurn = { id: crypto.randomUUID(), content, phase: "sending" };
    setDraft("");
    if (composer.current) composer.current.style.height = "auto";
    sendTurn(turn);
  };

  const retryTurn = () => {
    const turn = activeTurnRef.current;
    if (!turn || turn.phase !== "failed") return;
    sendTurn(turn);
  };

  const remove = async () => {
    if (!id || !confirm(t("chat.deleteConfirm"))) return;
    active.current = false;
    socket.current?.close();
    await api(`/api/v1/chats/${id}`, { method: "DELETE" });
    navigate("/history");
  };

  const turnIsStored = activeTurn ? messages.some((message) => message.role === "user" && message.id === activeTurn.id) : false;
  const composerBusy = activeTurn !== null;

  const deliveryStatus = (phase: TurnPhase) => (
    <small className={`chat-delivery-status ${phase === "failed" ? "failed" : ""}`} role={phase === "failed" ? "alert" : "status"}>
      {phase === "sending" && <><i aria-hidden="true" />{t("chat.sending")}</>}
      {(phase === "thinking" || phase === "streaming") && <><b aria-hidden="true">✓</b>{t("chat.sent")}</>}
      {phase === "failed" && <>{t("chat.failed")} <button type="button" onClick={retryTurn} disabled={status !== "open"}>{t("chat.retry")}</button></>}
    </small>
  );

  return <section className="chat-page page narrow">
    <header className="chat-header">
      <Link className="icon-button chat-back" to="/history" aria-label={t("common.back")}>←</Link>
      <div>
        <p className="eyebrow">{t("chat.eyebrow")}</p>
        <h1>{t("chat.title")}</h1>
        <p className={`connection-status ${status}`} role="status" aria-label={t("chat.statusLabel")}><span aria-hidden="true" />{status === "open" ? t("chat.connected") : t("chat.reconnecting")}</p>
      </div>
      <button className="icon-button chat-delete" aria-label={t("chat.delete")} onClick={() => void remove()}>⋯</button>
    </header>
    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 && !stream && !activeTurn && <div className="chat-empty"><span aria-hidden="true">易</span><p>{t("chat.empty")}</p></div>}
      {messages.map((message) => {
        const isActiveUserMessage = message.role === "user" && message.id === activeTurn?.id;
        return <article className={`chat-message ${message.role}`} key={message.seq}>
          <span>{message.role === "assistant" ? "易" : t("chat.you")}</span>
          <div className="chat-message-body">
            <p className="chat-bubble">{message.content}</p>
            {isActiveUserMessage && activeTurn && deliveryStatus(activeTurn.phase)}
          </div>
        </article>;
      })}
      {activeTurn && !turnIsStored && <article className="chat-message user pending" key={activeTurn.id}>
        <span>{t("chat.you")}</span>
        <div className="chat-message-body">
          <p className="chat-bubble">{activeTurn.content}</p>
          {deliveryStatus(activeTurn.phase)}
        </div>
      </article>}
      {activeTurn?.phase === "thinking" && <article className="chat-message assistant thinking" role="status">
        <span aria-hidden="true">易</span>
        <div className="chat-message-body">
          <p className="chat-bubble"><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>{t("chat.thinking")}</p>
        </div>
      </article>}
      {stream && <article className="chat-message assistant streaming">
        <span aria-hidden="true">易</span>
        <div className="chat-message-body"><p className="chat-bubble">{stream.content}<i aria-hidden="true" /></p></div>
      </article>}
    </div>
    <div className={`chat-compose ${composerBusy ? "busy" : ""}`}>
      <textarea
        ref={composer}
        rows={1}
        value={draft}
        maxLength={4000}
        disabled={composerBusy}
        aria-label={t("chat.placeholder")}
        placeholder={composerBusy ? t("chat.waitingPlaceholder") : t("chat.placeholder")}
        onChange={(event) => {
          setDraft(event.target.value);
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <button className="button primary" aria-label={composerBusy ? t("chat.waiting") : t("chat.send")} disabled={status !== "open" || !draft.trim() || composerBusy} onClick={send}>
        <span>{composerBusy ? t("chat.waiting") : t("chat.send")}</span>
        <b aria-hidden="true">{composerBusy ? "…" : "↑"}</b>
      </button>
    </div>
  </section>;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) map.set(message.seq, message);
  return [...map.values()].sort((left, right) => left.seq - right.seq);
}
