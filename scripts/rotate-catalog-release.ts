import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CatalogManifest, ValidatedCatalog } from "./validate-catalog";
import { validateCatalog } from "./validate-catalog";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "catalog/source-catalog.json");
const manifestPath = resolve(root, "catalog/catalog-manifest.json");

async function main() {
  const { catalog, manifest } = await validateCatalog({ production: false });
  if (!catalog) throw new Error("The reviewed source catalog is missing.");
  if (manifest.reviewStatus !== "approved" || !manifest.rightsEvidenceUri || !manifest.approvedBy) {
    throw new Error("The current catalog does not have complete approval evidence.");
  }

  const previousReleaseId = catalog.releaseId;
  const releaseId = randomUUID();
  const sourceIdPrefix = `takashima-${releaseId.slice(0, 8)}`;
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    id: `${sourceIdPrefix}:${entry.locale}:${entry.entryKey}`,
  }));
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("Release-scoped catalog entry IDs are not unique.");
  }

  const nextCatalog: ValidatedCatalog = { ...catalog, releaseId, entries };
  const catalogRaw = `${JSON.stringify(nextCatalog, null, 2)}\n`;
  const contentSha256 = createHash("sha256").update(catalogRaw).digest("hex");
  const approvedAt = new Date().toISOString();
  const nextManifest: CatalogManifest = {
    ...manifest,
    releaseId,
    reviewStatus: "approved",
    contentSha256,
    approvedBy: "Project owner, deployment session",
    approvedAt,
    notes: "Immutable release of the Takashima catalog-heading copy correction; line text, translations beneath the headings, provenance, and rights status are unchanged.",
  };

  const nonce = randomUUID();
  const catalogTemp = `${catalogPath}.${nonce}.tmp`;
  const manifestTemp = `${manifestPath}.${nonce}.tmp`;
  try {
    await Promise.all([
      writeFile(catalogTemp, catalogRaw, { encoding: "utf8", mode: 0o600 }),
      writeFile(manifestTemp, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8"),
    ]);
    await rename(catalogTemp, catalogPath);
    await rename(manifestTemp, manifestPath);
  } finally {
    await Promise.all([
      rm(catalogTemp, { force: true }),
      rm(manifestTemp, { force: true }),
    ]);
  }

  console.log(JSON.stringify({ previousReleaseId, releaseId, entries: entries.length, contentSha256, approvedAt }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Catalog release rotation failed");
  process.exitCode = 1;
});
