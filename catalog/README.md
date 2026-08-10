# Reviewed source catalog

`shared/catalog.ts` contains only the immutable King Wen identifiers and mappings needed to calculate reproducible facts. The separate reviewed source catalog supplies the directly displayed Takashima interpretation and optional AI grounding; no file from `ReferenceProg` is copied into production.

Production source-grounded AI requires a separately commissioned, licensed, or public-domain-marked `source-catalog.json`. It must conform to `source-catalog.schema.json` and contain, in each of `zh-HK`, `zh-CN`, and `en`:

- 64 `hexagram:kw-NN` entries;
- 384 `line:kw-NN:POSITION` entries, with positions 1–6;
- `special:kw-01:用九` and `special:kw-02:用六`.

That is exactly 1,350 approved entries. Every entry carries its own provenance and rights status. The manifest records an independent editorial approver, approval time, rights-evidence location, and SHA-256 of the exact JSON bytes.

Validation also rejects English records that retain an untranslated Chinese block, line label, or malformed mixed-language token. `scripts/repair-takashima-english.ts` can rebuild only those records from their approved Simplified Chinese counterparts, update the translation cache and create a new immutable catalog release.

Run `npm run release:catalog` for the non-production structural check. Once the reviewed file and manifest are complete, `npm run release:check` performs the strict check. Import into preview first with `npm run catalog:import:preview`; production import remains behind the same strict gate.

For an approved copy-only correction to an existing normalized artifact, run `npm run catalog:rotate-release`. It preserves catalog content and provenance while assigning a fresh release UUID, release-scoped entry IDs, approval timestamp, and exact-byte hash. Record the approval in `docs/takashima-catalog-approval.md` before importing the new release.
