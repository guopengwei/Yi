import type { CastFacts } from "../../shared/casting";
import type { Locale } from "../../shared/catalog";
import type { Env } from "../env";
import { sourceExcerptSchema, type SourceExcerpt } from "./deepseek";

interface CatalogRow extends Record<string, SqlStorageValue> {
  id: string;
  entry_key: string;
  locale: Locale;
  text: string;
  provenance_json: string;
  rights_status: SourceExcerpt["rightsStatus"];
  approval_status: "approved";
}

function requiredKeys(facts: CastFacts): string[] {
  const keys = [`hexagram:${facts.primary.id}`];
  if (facts.relating.id !== facts.primary.id) keys.push(`hexagram:${facts.relating.id}`);
  for (const line of facts.movingLines) keys.push(`line:${facts.primary.id}:${line.position}`);
  if (facts.specialLine) keys.push(`special:${facts.primary.id}:${facts.specialLine.lineKey}`);
  return [...new Set(keys)];
}

export async function reviewedSourceSnapshot(env: Env, facts: CastFacts, locale: Locale): Promise<SourceExcerpt[]> {
  if (env.CATALOG_REVIEWED !== "true") return [];
  const release = await env.DB.prepare(`
    SELECT id FROM catalog_releases
    WHERE review_status = 'approved' AND activated_at IS NOT NULL
    ORDER BY activated_at DESC LIMIT 1
  `).first<{ id: string }>();
  if (!release) return [];
  const keys = requiredKeys(facts);
  const rows = await env.DB.batch<CatalogRow>(keys.map((key) => env.DB.prepare(`
    SELECT id, entry_key, locale, text, provenance_json, rights_status, approval_status
    FROM source_catalog_entries
    WHERE release_id = ? AND locale = ? AND entry_key = ? AND approval_status = 'approved'
  `).bind(release.id, locale, key)));
  const found = rows.flatMap((result) => result.results);
  if (found.length !== keys.length || new Set(found.map((row) => row.entry_key)).size !== keys.length) return [];
  try {
    const snapshot = found.map((row) => ({
      id: row.id,
      releaseId: release.id,
      entryKey: row.entry_key,
      text: row.text,
      locale: row.locale,
      approvalStatus: row.approval_status,
      rightsStatus: row.rights_status,
      provenance: JSON.parse(row.provenance_json) as SourceExcerpt["provenance"],
    }));
    const validated = sourceExcerptSchema.array().safeParse(snapshot);
    return validated.success ? validated.data : [];
  } catch {
    return [];
  }
}
