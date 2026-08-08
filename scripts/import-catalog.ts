import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./validate-catalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv.includes("--env") ? process.argv[process.argv.indexOf("--env") + 1] : null;
if (target !== "preview" && target !== "production") throw new Error("Use --env preview or --env production.");

function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const { manifest, catalog } = await validateCatalog({ production: true });
if (!catalog || !manifest.releaseId || !manifest.contentSha256 || !manifest.rightsEvidenceUri || !manifest.approvedBy || !manifest.approvedAt) {
  throw new Error("Approved catalog metadata is incomplete.");
}

const approvedAt = Date.parse(manifest.approvedAt);
const statements = [
  `DELETE FROM catalog_releases WHERE id = ${sql(catalog.releaseId)};`,
  `INSERT INTO catalog_releases(id, schema_version, content_sha256, locales_json, rights_evidence_uri, review_status, approved_by, approved_at) VALUES (${sql(catalog.releaseId)}, 'yi-source-catalog@1', ${sql(manifest.contentSha256)}, '["zh-HK","zh-CN","en"]', ${sql(manifest.rightsEvidenceUri)}, 'approved', ${sql(manifest.approvedBy)}, ${approvedAt});`,
  ...catalog.entries.map((entry) => `INSERT INTO source_catalog_entries(id, release_id, entry_key, entry_type, locale, text, provenance_json, rights_status, approval_status) VALUES (${sql(entry.id)}, ${sql(catalog.releaseId)}, ${sql(entry.entryKey)}, ${sql(entry.entryType)}, ${sql(entry.locale)}, ${sql(entry.text)}, ${sql(JSON.stringify(entry.provenance))}, ${sql(entry.rightsStatus)}, 'approved');`),
  "UPDATE catalog_releases SET activated_at = NULL WHERE activated_at IS NOT NULL;",
  `UPDATE catalog_releases SET activated_at = ${Date.now()} WHERE id = ${sql(catalog.releaseId)} AND review_status = 'approved' AND (SELECT count(*) FROM source_catalog_entries WHERE release_id = ${sql(catalog.releaseId)}) = 1350;`,
];

const tempDir = await mkdtemp(join(tmpdir(), "yi-catalog-"));
const sqlPath = join(tempDir, "catalog.sql");
try {
  await writeFile(sqlPath, `${statements.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  execFileSync(resolve(root, "node_modules/.bin/wrangler"), [
    "d1", "execute", target === "production" ? "yi-db" : "yi-db-preview",
    "--remote", "--env", target, "--file", sqlPath,
  ], { cwd: root, stdio: "inherit" });
  console.log(`Imported and activated catalog ${catalog.releaseId} in ${target}.`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
