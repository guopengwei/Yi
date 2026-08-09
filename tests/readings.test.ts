import { describe, expect, it } from "vitest";
import { deriveReadingFacts } from "../shared/casting";
import { readingCreateSchema } from "../shared/contracts";
import type { Env } from "../worker/env";
import { parseSourceSnapshot, type SourceExcerpt } from "../worker/lib/deepseek";
import { mappedTakashimaInterpretations } from "../worker/lib/readings";
import { localizedSourceSnapshot, reviewedSourceSnapshot } from "../worker/lib/source-catalog";

const facts = deriveReadingFacts(readingCreateSchema.parse({
  schemaVersion: "reading-create@1",
  clientRequestId: "00000000-0000-4000-8000-000000000001",
  castingMethod: "three-number@1",
  inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition: 1 },
  question: { kind: "none" },
  timezone: "Asia/Hong_Kong",
}));

function source(entryKey: string, locale: SourceExcerpt["locale"] = "en"): SourceExcerpt {
  return {
    id: `takashima-test:${locale}:${entryKey}`,
    releaseId: "00000000-0000-4000-8000-000000000099",
    entryKey,
    text: `${locale} reviewed text for ${entryKey}`,
    locale,
    approvalStatus: "approved",
    rightsStatus: "permission",
    provenance: { title: "Takashima Ekidan", locator: entryKey },
  };
}

function catalogEnv(entries: readonly SourceExcerpt[], releaseId = entries[0]?.releaseId): Env {
  interface BoundQuery { values: unknown[] }
  const db = {
    prepare() {
      return {
        async first() { return releaseId ? { id: releaseId } : null; },
        bind(...values: unknown[]): BoundQuery { return { values }; },
      };
    },
    async batch(queries: BoundQuery[]) {
      return queries.map((query) => {
        const [queryReleaseId, locale, entryKey] = query.values as [string, SourceExcerpt["locale"], string];
        const found = entries.filter((entry) => entry.releaseId === queryReleaseId && entry.locale === locale && entry.entryKey === entryKey);
        return {
          success: true,
          results: found.map((entry) => ({
            id: entry.id,
            entry_key: entry.entryKey,
            locale: entry.locale,
            text: entry.text,
            provenance_json: JSON.stringify(entry.provenance),
            rights_status: entry.rightsStatus,
            approval_status: entry.approvalStatus,
          })),
          meta: {},
        };
      });
    },
  };
  return { DB: db, CATALOG_REVIEWED: "true" } as unknown as Env;
}

describe("mapped Takashima interpretation", () => {
  it("returns only the reviewed entry for the primary hexagram's changing line", () => {
    const changingLine = source(`line:${facts.primary.id}:1`);
    const sources = [
      source(`hexagram:${facts.primary.id}`),
      source(`hexagram:${facts.relating.id}`),
      changingLine,
      source(`line:${facts.primary.id}:2`),
    ];

    expect(mappedTakashimaInterpretations(sources, facts)).toEqual([changingLine]);
  });

  it("fails closed for missing or malformed source snapshots", () => {
    expect(parseSourceSnapshot(null, true)).toEqual([]);
    expect(parseSourceSnapshot("not-json", true)).toEqual([]);
  });

  it("snapshots every required Takashima entry in all supported locales", async () => {
    const entryKeys = [
      `hexagram:${facts.primary.id}`,
      `hexagram:${facts.relating.id}`,
      `line:${facts.primary.id}:1`,
    ];
    const catalog = (["zh-HK", "zh-CN", "en"] as const).flatMap((locale) => entryKeys.map((entryKey) => source(entryKey, locale)));

    const snapshot = await reviewedSourceSnapshot(catalogEnv(catalog), facts);

    expect(snapshot).toHaveLength(entryKeys.length * 3);
    expect(new Set(snapshot.map((entry) => entry.locale))).toEqual(new Set(["zh-HK", "zh-CN", "en"]));
  });

  it.each(["zh-HK", "zh-CN", "en"] as const)("selects only %s from a trilingual snapshot", async (locale) => {
    const entryKeys = [`hexagram:${facts.primary.id}`, `line:${facts.primary.id}:1`];
    const catalog = (["zh-HK", "zh-CN", "en"] as const).flatMap((entryLocale) => entryKeys.map((entryKey) => source(entryKey, entryLocale)));

    const localized = await localizedSourceSnapshot(catalogEnv([]), JSON.stringify(catalog), true, locale);

    expect(localized).toHaveLength(entryKeys.length);
    expect(localized.every((entry) => entry.locale === locale)).toBe(true);
  });

  it("recovers a requested translation for a legacy single-locale reading from its original release", async () => {
    const entryKeys = [`hexagram:${facts.primary.id}`, `line:${facts.primary.id}:1`];
    const legacySnapshot = entryKeys.map((entryKey) => source(entryKey, "en"));
    const traditionalCatalog = entryKeys.map((entryKey) => source(entryKey, "zh-HK"));

    const localized = await localizedSourceSnapshot(
      catalogEnv(traditionalCatalog),
      JSON.stringify(legacySnapshot),
      true,
      "zh-HK",
    );

    expect(localized.map((entry) => entry.locale)).toEqual(["zh-HK", "zh-HK"]);
    expect(localized.map((entry) => entry.entryKey)).toEqual(entryKeys);
  });
});
