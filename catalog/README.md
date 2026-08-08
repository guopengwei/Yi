# Reviewed source catalog

The application deliberately ships without interpretation text. `shared/catalog.ts` contains only the immutable King Wen identifiers and mappings needed to calculate reproducible facts; no source prose from `ReferenceProg` is copied into production.

Production source-grounded AI requires a separately commissioned, licensed, or public-domain-marked `source-catalog.json`. It must conform to `source-catalog.schema.json` and contain, in each of `zh-HK`, `zh-CN`, and `en`:

- 64 `hexagram:kw-NN` entries;
- 384 `line:kw-NN:POSITION` entries, with positions 1–6;
- `special:kw-01:用九` and `special:kw-02:用六`.

That is exactly 1,350 approved entries. Every entry carries its own provenance and rights status. The manifest records an independent editorial approver, approval time, rights-evidence location, and SHA-256 of the exact JSON bytes.

Run `npm run release:catalog` for the non-production structural check. Once the reviewed file and manifest are complete, `npm run release:check` performs the strict check. Import into preview first with `npm run catalog:import:preview`; production import remains behind the same strict gate.
