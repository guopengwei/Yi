import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { reserveBudget } from "../lib/budget";
import { isProviderEnabled } from "../lib/ai-config";
import { CHAT_PROMPT_VERSION, createChatReply, DEEPSEEK_MODEL, estimateDeepSeekReservation, type ChatContext } from "../lib/deepseek";
import { ApiError } from "../lib/errors";
import type { Env } from "../env";

interface ConnectionAttachment {
  ownerId: string;
}

interface StoredMessage {
  [key: string]: SqlStorageValue;
  seq: number;
  client_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: number;
}

const clientMessageSchema = z.object({
  type: z.literal("message"),
  id: z.string().uuid(),
  content: z.string().trim().min(1).max(4_000),
}).strict();

export class ReadingChat extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS conversation (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          conversation_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          archive_id TEXT NOT NULL,
          context_hash TEXT NOT NULL,
          context_json TEXT NOT NULL,
          initialized_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  initialize(input: { conversationId: string; ownerId: string; archiveId: string; contextHash: string; context: ChatContext }): { ok: true } | { ok: false; code: "CHAT_CONTEXT_CONFLICT" } {
    const existing = this.ctx.storage.sql.exec<{ conversation_id: string; owner_id: string; archive_id: string; context_hash: string }>(
      "SELECT conversation_id, owner_id, archive_id, context_hash FROM conversation WHERE singleton = 1",
    ).toArray()[0];
    if (existing) {
      if (existing.conversation_id !== input.conversationId || existing.owner_id !== input.ownerId || existing.archive_id !== input.archiveId || existing.context_hash !== input.contextHash) {
        return { ok: false, code: "CHAT_CONTEXT_CONFLICT" };
      }
      return { ok: true };
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO conversation(singleton, conversation_id, owner_id, archive_id, context_hash, context_json, initialized_at) VALUES (1, ?, ?, ?, ?, ?, ?)",
      input.conversationId,
      input.ownerId,
      input.archiveId,
      input.contextHash,
      JSON.stringify(input.context),
      Date.now(),
    );
    return { ok: true };
  }

  list(ownerId: string, after = 0): StoredMessage[] {
    this.authorize(ownerId);
    return this.ctx.storage.sql.exec<StoredMessage>(
      "SELECT seq, client_id, role, content, created_at FROM messages WHERE seq > ? ORDER BY seq LIMIT 200",
      Math.max(0, Math.floor(after)),
    ).toArray();
  }

  erase(ownerId: string): void {
    this.authorize(ownerId);
    for (const socket of this.ctx.getWebSockets()) socket.close(1000, "conversation deleted");
    this.ctx.storage.sql.exec("DELETE FROM messages; DELETE FROM conversation;");
  }

  async fetch(request: Request): Promise<Response> {
    const ownerId = request.headers.get("X-Yi-Owner-Id");
    if (!ownerId) return new Response("Unauthorized", { status: 401 });
    try {
      this.authorize(ownerId);
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.serializeAttachment({ ownerId } satisfies ConnectionAttachment);
    this.ctx.acceptWebSocket(server);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const messages = this.list(ownerId, Number.isSafeInteger(after) ? after : 0);
    server.send(JSON.stringify({ type: "resume", messages: messages.map(presentMessage) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
    if (!attachment?.ownerId || typeof data !== "string") {
      socket.close(1008, "invalid message");
      return;
    }
    const parsedJson = (() => { try { return JSON.parse(data) as unknown; } catch { return null; } })();
    const parsed = clientMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: "error", code: "INVALID_CHAT_MESSAGE" }));
      return;
    }
    try {
      await this.handleTurn(attachment.ownerId, parsed.data.id, parsed.data.content);
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", code: error instanceof Error ? error.message : "CHAT_FAILED" }));
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  private authorize(ownerId: string) {
    const row = this.ctx.storage.sql.exec<{ owner_id: string }>("SELECT owner_id FROM conversation WHERE singleton = 1").toArray()[0];
    if (!row || row.owner_id !== ownerId) throw new Error("CHAT_FORBIDDEN");
    return row;
  }

  private broadcast(payload: unknown) {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* stale connection */ }
    }
  }

  private async handleTurn(ownerId: string, clientId: string, content: string) {
    this.authorize(ownerId);
    const existing = this.ctx.storage.sql.exec<StoredMessage>(
      "SELECT seq, client_id, role, content, created_at FROM messages WHERE client_id = ?",
      clientId,
    ).toArray()[0];
    if (existing) {
      this.broadcast({ type: "ack", message: presentMessage(existing), duplicate: true });
      return;
    }
    const conversation = this.ctx.storage.sql.exec<{ context_json: string }>("SELECT context_json FROM conversation WHERE singleton = 1").one();
    const context = JSON.parse(conversation.context_json) as ChatContext;
    const previousHistory = this.ctx.storage.sql.exec<StoredMessage>(
      "SELECT seq, client_id, role, content, created_at FROM messages ORDER BY seq DESC LIMIT 19",
    ).toArray().reverse().map((message) => ({ role: message.role, content: message.content }));
    const projectedHistory = [...previousHistory, { role: "user" as const, content }];
    let providerEligible = !context.safetyRouted && context.sources.length > 0 && await isProviderEnabled(this.env);
    const operationId = crypto.randomUUID();
    const estimate = providerEligible ? estimateDeepSeekReservation({ context, messages: projectedHistory }, 900) : null;
    let budget;
    try {
      budget = await reserveBudget(this.env, {
        reservationId: operationId,
        identityKey: `user:${ownerId}`,
        kind: "chat",
        registered: true,
        estimatedTokens: estimate?.estimatedTokens ?? 0,
        estimatedSpendMicros: estimate?.estimatedSpendMicros ?? 0,
        enforceGlobal: providerEligible,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code === "DAILY_AI_LIMIT") throw error;
      providerEligible = false;
      budget = await reserveBudget(this.env, {
        reservationId: `${operationId}:deterministic`,
        identityKey: `user:${ownerId}`,
        kind: "chat",
        registered: true,
        estimatedTokens: 0,
        estimatedSpendMicros: 0,
        enforceGlobal: false,
      });
    }
    const now = Date.now();
    const userMessage = this.ctx.storage.sql.exec<StoredMessage>(
      "INSERT INTO messages(client_id, role, content, created_at) VALUES (?, 'user', ?, ?) RETURNING seq, client_id, role, content, created_at",
      clientId,
      content,
      now,
    ).one();
    this.broadcast({ type: "ack", message: presentMessage(userMessage), remaining: budget.remaining });
    const result = await createChatReply(this.env, { context, messages: projectedHistory, providerAllowed: providerEligible });
    await budget.reconcile(result.usage.totalTokens, result.usage.spendMicros, result.fallbackReason ? "failure" : "success");
    const assistantMessage = this.ctx.storage.sql.exec<StoredMessage>(
      "INSERT INTO messages(client_id, role, content, created_at) VALUES (?, 'assistant', ?, ?) RETURNING seq, client_id, role, content, created_at",
      crypto.randomUUID(),
      result.content,
      Date.now(),
    ).one();
    this.broadcast({ type: "stream-start", seq: assistantMessage.seq });
    for (let index = 0; index < result.content.length; index += 32) {
      this.broadcast({ type: "stream-delta", seq: assistantMessage.seq, delta: result.content.slice(index, index + 32) });
    }
    this.broadcast({ type: "stream-end", message: presentMessage(assistantMessage), fallbackReason: result.fallbackReason });
    const conversationId = this.ctx.storage.sql.exec<{ conversation_id: string }>("SELECT conversation_id FROM conversation WHERE singleton = 1").one().conversation_id;
    await this.env.DB.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(Date.now(), conversationId, ownerId).run();
    await this.env.DB.prepare(`
      INSERT INTO ai_operations(
        id, user_id, identity_key, operation_kind, model_version, prompt_version, status, safety_outcome,
        input_tokens, output_tokens, spend_micros, latency_ms, error_code, created_at
      ) VALUES (?, ?, ?, 'chat', ?, ?, ?, 'clear', ?, ?, ?, ?, ?, ?)
    `).bind(
      operationId,
      ownerId,
      `user:${ownerId}`,
      DEEPSEEK_MODEL,
      CHAT_PROMPT_VERSION,
      result.fallbackReason ? "fallback" : "success",
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.spendMicros,
      result.latencyMs,
      result.fallbackReason,
      Date.now(),
    ).run();
  }
}

function presentMessage(message: StoredMessage) {
  return {
    seq: message.seq,
    id: message.client_id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.created_at).toISOString(),
  };
}
