import type { CastFacts } from "../../shared/casting";
import type { Locale } from "../../shared/catalog";
import type { Env } from "../env";
import { parseSourceSnapshot, sourceExcerptSchema, type SourceExcerpt } from "./deepseek";

const SOURCE_LOCALES = ["zh-HK", "zh-CN", "en"] as const satisfies readonly Locale[];

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

function validatedSnapshot(releaseId: string, rows: CatalogRow[]): SourceExcerpt[] {
  try {
    const snapshot = rows.map((row) => ({
      id: row.id,
      releaseId,
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

export async function reviewedSourceSnapshot(env: Env, facts: CastFacts): Promise<SourceExcerpt[]> {
  if (env.CATALOG_REVIEWED !== "true") return [];
  const release = await env.DB.prepare(`
    SELECT id FROM catalog_releases
    WHERE review_status = 'approved' AND activated_at IS NOT NULL
    ORDER BY activated_at DESC LIMIT 1
  `).first<{ id: string }>();
  if (!release) return [];
  const keys = requiredKeys(facts);
  const requested = SOURCE_LOCALES.flatMap((locale) => keys.map((key) => ({ locale, key })));
  const rows = await env.DB.batch<CatalogRow>(requested.map(({ locale, key }) => env.DB.prepare(`
    SELECT id, entry_key, locale, text, provenance_json, rights_status, approval_status
    FROM source_catalog_entries
    WHERE release_id = ? AND locale = ? AND entry_key = ? AND approval_status = 'approved'
  `).bind(release.id, locale, key)));
  const found = rows.flatMap((result) => result.results);
  const foundKeys = new Set(found.map((row) => `${row.locale}:${row.entry_key}`));
  if (found.length !== requested.length || foundKeys.size !== requested.length) return [];
  return validatedSnapshot(release.id, found);
}

/**
 * Selects the requested language from a trilingual snapshot. Older readings only
 * stored one language, so recover the equivalent approved entries from that
 * reading's immutable catalog release instead of using the latest release.
 */
export async function localizedSourceSnapshot(
  env: Env,
  json: string | null,
  included: boolean,
  locale: Locale,
): Promise<SourceExcerpt[]> {
  const snapshot = parseSourceSnapshot(json, included);
  if (snapshot.length === 0) return [];
  const entryKeys = [...new Set(snapshot.map((source) => source.entryKey))];
  const localized = snapshot.filter((source) => source.locale === locale);
  if (localized.length === entryKeys.length && new Set(localized.map((source) => source.entryKey)).size === entryKeys.length) {
    return localized;
  }

  const releaseIds = [...new Set(snapshot.map((source) => source.releaseId))];
  if (releaseIds.length !== 1) return [];
  const releaseId = releaseIds[0]!;
  const rows = await env.DB.batch<CatalogRow>(entryKeys.map((entryKey) => env.DB.prepare(`
    SELECT entries.id, entries.entry_key, entries.locale, entries.text, entries.provenance_json,
      entries.rights_status, entries.approval_status
    FROM source_catalog_entries entries
    JOIN catalog_releases releases ON releases.id = entries.release_id
    WHERE entries.release_id = ? AND entries.locale = ? AND entries.entry_key = ?
      AND entries.approval_status = 'approved' AND releases.review_status = 'approved'
  `).bind(releaseId, locale, entryKey)));
  const found = rows.flatMap((result) => result.results);
  if (found.length !== entryKeys.length || new Set(found.map((row) => row.entry_key)).size !== entryKeys.length) return [];
  return validatedSnapshot(releaseId, found);
}
