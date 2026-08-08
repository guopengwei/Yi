import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

export interface ReservationRequest {
  reservationId: string;
  identityKey: string;
  kind: "reflection" | "chat";
  individualLimit: number;
  estimatedTokens: number;
  estimatedSpendMicros: number;
  globalTokenLimit: number;
  globalSpendMicrosLimit: number;
  maxConcurrency: number;
  enforceGlobal: boolean;
}

export interface ReservationResult {
  ok: boolean;
  code?: "INDIVIDUAL_LIMIT" | "GLOBAL_TOKEN_LIMIT" | "GLOBAL_SPEND_LIMIT" | "GLOBAL_CONCURRENCY_LIMIT" | "INVALID_LIMITS";
  remaining?: number;
}

export class BudgetCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS global_usage (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          tokens INTEGER NOT NULL,
          spend_micros INTEGER NOT NULL,
          concurrency INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO global_usage(singleton, tokens, spend_micros, concurrency) VALUES (1, 0, 0, 0);
        CREATE TABLE IF NOT EXISTS identity_usage (
          identity_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY(identity_key, kind)
        );
        CREATE TABLE IF NOT EXISTS reservations (
          id TEXT PRIMARY KEY,
          identity_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          estimated_tokens INTEGER NOT NULL,
          estimated_spend_micros INTEGER NOT NULL,
          actual_tokens INTEGER,
          actual_spend_micros INTEGER,
          enforce_global INTEGER NOT NULL,
          status TEXT NOT NULL
        );
      `);
    });
  }

  reserve(input: ReservationRequest): ReservationResult {
    const integerLimits = [
      input.individualLimit,
      input.estimatedTokens,
      input.estimatedSpendMicros,
      input.globalTokenLimit,
      input.globalSpendMicrosLimit,
      input.maxConcurrency,
    ];
    if (integerLimits.some((value) => !Number.isSafeInteger(value) || value < 0) || input.maxConcurrency < 1) {
      return { ok: false, code: "INVALID_LIMITS" };
    }
    const existing = this.ctx.storage.sql.exec<{ status: string }>("SELECT status FROM reservations WHERE id = ?", input.reservationId).toArray()[0];
    if (existing) return { ok: existing.status === "reserved" || existing.status === "reconciled" };

    const individual = this.ctx.storage.sql.exec<{ count: number }>(
      "SELECT count FROM identity_usage WHERE identity_key = ? AND kind = ?",
      input.identityKey,
      input.kind,
    ).toArray()[0]?.count ?? 0;
    if (individual >= input.individualLimit) return { ok: false, code: "INDIVIDUAL_LIMIT", remaining: 0 };

    const global = this.ctx.storage.sql.exec<{ tokens: number; spend_micros: number; concurrency: number }>(
      "SELECT tokens, spend_micros, concurrency FROM global_usage WHERE singleton = 1",
    ).one();
    if (input.enforceGlobal && global.tokens + input.estimatedTokens > input.globalTokenLimit) return { ok: false, code: "GLOBAL_TOKEN_LIMIT" };
    if (input.enforceGlobal && global.spend_micros + input.estimatedSpendMicros > input.globalSpendMicrosLimit) return { ok: false, code: "GLOBAL_SPEND_LIMIT" };
    if (input.enforceGlobal && global.concurrency >= input.maxConcurrency) return { ok: false, code: "GLOBAL_CONCURRENCY_LIMIT" };

    this.ctx.storage.sql.exec(
      "INSERT INTO reservations(id, identity_key, kind, estimated_tokens, estimated_spend_micros, enforce_global, status) VALUES (?, ?, ?, ?, ?, ?, 'reserved')",
      input.reservationId,
      input.identityKey,
      input.kind,
      input.estimatedTokens,
      input.estimatedSpendMicros,
      input.enforceGlobal ? 1 : 0,
    );
    this.ctx.storage.sql.exec(`
      INSERT INTO identity_usage(identity_key, kind, count) VALUES (?, ?, 1)
      ON CONFLICT(identity_key, kind) DO UPDATE SET count = count + 1
    `, input.identityKey, input.kind);
    if (input.enforceGlobal) {
      this.ctx.storage.sql.exec(`
        UPDATE global_usage
        SET tokens = tokens + ?, spend_micros = spend_micros + ?, concurrency = concurrency + 1
        WHERE singleton = 1
      `, input.estimatedTokens, input.estimatedSpendMicros);
    }
    return { ok: true, remaining: Math.max(0, input.individualLimit - individual - 1) };
  }

  reconcile(input: { reservationId: string; actualTokens: number; actualSpendMicros: number; outcome: "success" | "failure" }): void {
    if (!Number.isSafeInteger(input.actualTokens) || input.actualTokens < 0 || !Number.isSafeInteger(input.actualSpendMicros) || input.actualSpendMicros < 0) return;
    const reservation = this.ctx.storage.sql.exec<{
      estimated_tokens: number;
      estimated_spend_micros: number;
      enforce_global: number;
      status: string;
    }>("SELECT estimated_tokens, estimated_spend_micros, enforce_global, status FROM reservations WHERE id = ?", input.reservationId).toArray()[0];
    if (!reservation || reservation.status !== "reserved") return;
    if (reservation.enforce_global === 1) {
      this.ctx.storage.sql.exec(`
        UPDATE global_usage
        SET tokens = max(0, tokens + ? - ?),
            spend_micros = max(0, spend_micros + ? - ?),
            concurrency = max(0, concurrency - 1)
        WHERE singleton = 1
      `, input.actualTokens, reservation.estimated_tokens, input.actualSpendMicros, reservation.estimated_spend_micros);
    }
    this.ctx.storage.sql.exec(`
      UPDATE reservations
      SET actual_tokens = ?, actual_spend_micros = ?, status = ?
      WHERE id = ?
    `, input.actualTokens, input.actualSpendMicros, input.outcome === "success" ? "reconciled" : "failed", input.reservationId);
  }

  snapshot() {
    const global = this.ctx.storage.sql.exec<{ tokens: number; spend_micros: number; concurrency: number }>(
      "SELECT tokens, spend_micros, concurrency FROM global_usage WHERE singleton = 1",
    ).one();
    const counts = this.ctx.storage.sql.exec<{ kind: string; count: number }>(
      "SELECT kind, sum(count) AS count FROM identity_usage GROUP BY kind",
    ).toArray();
    return { global, counts };
  }
}
