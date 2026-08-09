# Takashima catalog approval

- Approval date: 2026-08-08
- Approver: Project owner, deployment session
- Approved source artifact: `ReferenceProg/cloudfunctions/divination/takashimaData.json`
- Source SHA-256: `f5cdf925a53eb1bdf8a07865397112a4bf07c6b089f6055a3b1fc74d197a095f`
- Approved use: production Yi source catalog, including faithful Traditional Chinese and English translations and hexagram-level compilations of the six source line texts
- Rights basis recorded for the catalog: permission from the project owner

The approved artifact contains Simplified Chinese line text and Takashima commentary for all 384 ordinary lines and the two pure-hexagram special lines. It contains no independent hexagram Judgment or Image records. Accordingly, generated hexagram entries must be labeled compilations of the six line texts and must not claim to be a source Judgment or Image. Complete commentary remains in the corresponding line entries.

No file from `ReferenceProg` is deployed. The production release contains only the normalized catalog entries, per-entry provenance, the approved artifact hash, and this approval record.

## English locale correction — 2026-08-09

An automated language audit found 47 English line records containing an untranslated Chinese block, line label, or malformed mixed-language token. Those records were translated again from their already approved Simplified Chinese counterparts; 14 derived English hexagram compilations were rebuilt from the corrected line texts. Release `9af8e7f7-a596-4486-a344-9d58607ba2dd` records the corrected catalog bytes. The release validator now blocks these classes of incomplete English translation from recurring.
