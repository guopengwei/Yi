import type { Context } from "hono";
import type { CastFacts } from "../../shared/casting";
import type { Locale } from "../../shared/catalog";
import type { AppVariables, Env } from "../env";
import type { Identity } from "./identity";
import type { SourceExcerpt } from "./deepseek";
import { ApiError } from "./errors";
import { localizedSourceSnapshot } from "./source-catalog";

export interface ReadingRow {
  id: string;
  client_request_id: string;
  identity_key: string;
  user_id: string | null;
  guest_id_hash: string | null;
  request_fingerprint: string;
  casting_method: string;
  question_text: string | null;
  question_kind: "none" | "question";
  timezone: string;
  facts_json: string;
  reflection_json: string | null;
  reflection_included_question: number;
  source_snapshot_json: string | null;
  safety_json: string;
  contribution_amount_hkd: number | null;
  status: "awaiting_contribution" | "payment_pending" | "ready" | "failed" | "expired";
  prompt_version: string | null;
  model_version: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export async function ownedReading(c: Context<{ Bindings: Env; Variables: AppVariables }>, id: string, identity: Identity): Promise<ReadingRow> {
  const row = await c.env.DB.prepare("SELECT * FROM reading_operations WHERE id = ? AND identity_key = ?")
    .bind(id, identity.key).first<ReadingRow>();
  if (!row) throw new ApiError("READING_NOT_FOUND", 404, "Reading not found.");
  if (row.expires_at && row.expires_at <= Date.now()) throw new ApiError("READING_EXPIRED", 404, "Reading has expired.");
  return row;
}

export function mappedTakashimaInterpretations(sources: readonly SourceExcerpt[], facts: CastFacts): SourceExcerpt[] {
  const mappedEntryKeys = new Set(facts.movingLines.map((line) => `line:${facts.primary.id}:${line.position}`));
  if (facts.specialLine) mappedEntryKeys.add(`special:${facts.primary.id}:${facts.specialLine.lineKey}`);
  return sources.filter((source) => mappedEntryKeys.has(source.entryKey));
}

export async function publicReading(env: Env, row: ReadingRow, locale: Locale) {
  const base = {
    id: row.id,
    status: row.status,
    contributionAmountHkd: row.contribution_amount_hkd,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
  if (row.status !== "ready") return base;
  const facts = JSON.parse(row.facts_json) as CastFacts;
  const sources = await localizedSourceSnapshot(env, row.source_snapshot_json, true, locale);
  return {
    ...base,
    facts,
    takashimaInterpretations: mappedTakashimaInterpretations(sources, facts),
    reflection: row.reflection_json ? JSON.parse(row.reflection_json) as unknown : null,
    reflectionShareEligible: Boolean(row.reflection_json) && row.reflection_included_question !== 1,
    safety: JSON.parse(row.safety_json) as unknown,
  };
}

export async function archiveReading(env: Env, input: { userId: string; reading: ReadingRow; title?: string }) {
  if (input.reading.status !== "ready") throw new ApiError("READING_NOT_READY", 409, "Complete the contribution step first.");
  if (input.reading.user_id && input.reading.user_id !== input.userId) throw new ApiError("READING_NOT_FOUND", 404, "Reading not found.");
  const existing = await env.DB.prepare("SELECT id FROM archived_readings WHERE reading_operation_id = ? AND user_id = ?")
    .bind(input.reading.id, input.userId).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare("UPDATE reading_operations SET expires_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(Date.now(), input.reading.id, input.userId).run();
    return existing.id;
  }
  const archiveId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO archived_readings(id, user_id, reading_operation_id, title, question_text, facts_json, reflection_json, reflection_included_question, safety_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      archiveId,
      input.userId,
      input.reading.id,
      input.title?.trim().slice(0, 120) || null,
      input.reading.question_text,
      input.reading.facts_json,
      input.reading.reflection_json,
      input.reading.reflection_included_question,
      input.reading.safety_json,
      now,
      now,
    ),
    env.DB.prepare("UPDATE reading_operations SET expires_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(now, input.reading.id, input.userId),
  ]);
  return archiveId;
}
