import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { IDENTIFIER_CATALOG } from "../shared/catalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = resolve(root, "catalog");

const manifestSchema = z.object({
  schemaVersion: z.literal("yi-source-catalog-manifest@1"),
  releaseId: z.uuid().nullable(),
  reviewStatus: z.enum(["draft", "approved", "withdrawn"]),
  sourceCatalogFile: z.literal("source-catalog.json"),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  rightsEvidenceUri: z.string().min(1).nullable(),
  approvedBy: z.string().min(1).nullable(),
  approvedAt: z.iso.datetime().nullable(),
  notes: z.string().optional(),
}).strict();

const provenanceSchema = z.object({
  title: z.string().min(1).max(500),
  creator: z.string().max(300).optional(),
  publication: z.string().max(500).optional(),
  locator: z.string().min(1).max(500),
  sourceUrl: z.url().max(2_000).optional(),
}).strict();

const entrySchema = z.object({
  id: z.string().min(1).max(200),
  entryKey: z.string().min(1).max(200),
  entryType: z.enum(["hexagram", "line", "special-line"]),
  locale: z.enum(["zh-HK", "zh-CN", "en"]),
  text: z.string().trim().min(1).max(8_000),
  provenance: provenanceSchema,
  rightsStatus: z.enum(["public-domain-mark", "permission", "commissioned"]),
  approvalStatus: z.literal("approved"),
}).strict();

const sourceCatalogSchema = z.object({
  schemaVersion: z.literal("yi-source-catalog@1"),
  releaseId: z.uuid(),
  entries: z.array(entrySchema).length(1_350),
}).strict();

export type ValidatedCatalog = z.infer<typeof sourceCatalogSchema>;
export type CatalogManifest = z.infer<typeof manifestSchema>;

function expectedKeys(): Map<string, "hexagram" | "line" | "special-line"> {
  const keys = new Map<string, "hexagram" | "line" | "special-line">();
  for (const hexagram of IDENTIFIER_CATALOG) {
    keys.set(`hexagram:${hexagram.id}`, "hexagram");
    for (let position = 1; position <= 6; position += 1) keys.set(`line:${hexagram.id}:${position}`, "line");
  }
  keys.set("special:kw-01:用九", "special-line");
  keys.set("special:kw-02:用六", "special-line");
  return keys;
}

export async function validateCatalog(options: { production: boolean }): Promise<{ manifest: CatalogManifest; catalog: ValidatedCatalog | null; raw: string | null }> {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(resolve(catalogDir, "catalog-manifest.json"), "utf8")));
  let raw: string;
  try {
    raw = await readFile(resolve(catalogDir, manifest.sourceCatalogFile), "utf8");
  } catch {
    if (options.production) throw new Error("Production blocked: catalog/source-catalog.json is missing.");
    return { manifest, catalog: null, raw: null };
  }
  const catalog = sourceCatalogSchema.parse(JSON.parse(raw));
  const expected = expectedKeys();
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  for (const entry of catalog.entries) {
    const expectedType = expected.get(entry.entryKey);
    if (!expectedType || expectedType !== entry.entryType) throw new Error(`Unexpected catalog key/type: ${entry.entryKey}`);
    const localeKey = `${entry.locale}:${entry.entryKey}`;
    if (seenKeys.has(localeKey)) throw new Error(`Duplicate catalog locale/key: ${localeKey}`);
    if (seenIds.has(entry.id)) throw new Error(`Duplicate catalog source id: ${entry.id}`);
    seenKeys.add(localeKey);
    seenIds.add(entry.id);
  }
  for (const locale of ["zh-HK", "zh-CN", "en"] as const) {
    for (const key of expected.keys()) if (!seenKeys.has(`${locale}:${key}`)) throw new Error(`Missing ${locale} catalog entry: ${key}`);
  }
  if (options.production) {
    if (manifest.reviewStatus !== "approved" || !manifest.releaseId || !manifest.contentSha256 || !manifest.rightsEvidenceUri || !manifest.approvedBy || !manifest.approvedAt) {
      throw new Error("Production blocked: catalog approval and rights evidence are incomplete.");
    }
    if (manifest.releaseId !== catalog.releaseId) throw new Error("Production blocked: catalog release IDs do not match.");
    const actualHash = createHash("sha256").update(raw).digest("hex");
    if (actualHash !== manifest.contentSha256) throw new Error("Production blocked: source catalog SHA-256 does not match the approved manifest.");
  }
  return { manifest, catalog, raw };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = process.argv.includes("--production");
  validateCatalog({ production }).then(({ catalog }) => {
    if (catalog) console.log(`Catalog valid: ${catalog.entries.length} approved trilingual entries.`);
    else console.log("Catalog structure ready; production remains gated because reviewed source prose is intentionally absent.");
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
