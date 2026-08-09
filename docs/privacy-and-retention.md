# Privacy and retention boundaries

## Data minimization

- Questions remain server-side and are not sent to DeepSeek unless the user explicitly agrees to the disclosed AI data scope for that reading.
- A reading requires one explicit AI consent covering its disclosed facts, question and rights-cleared source excerpts. Follow-up chat reuses that stored data scope instead of asking again.
- Safety-routed questions bypass AI entirely.
- DeepSeek API credentials and provider reasoning never reach browser responses.
- Anonymous share snapshots contain deterministic facts and, when eligible and selected, the reflection. They never contain account identity, question, notes or chat.
- Normal administrator responses expose operational metadata only. Question, note and chat text are deliberately absent.
- Error and audit records store stable codes and hashed/opaque identifiers, not prompt content.

## Retention

- Unsaved guest readings expire within seven days and are removed by the daily cleanup trigger.
- Share snapshots expire after seven days and can be revoked earlier by the owner.
- Archived readings, notes and chats have no membership count limit and remain until individually deleted or the account is closed.
- Account deletion uses Better Auth confirmation, erases chat Durable Objects, and relies on D1 cascades for owned relational data.
- Deleting one saved reading deletes its question-bearing source operation plus notes, shares and chat records. Contribution rows retain amount/status and Stripe identifiers but their reading and user foreign keys become null.
- Anonymized payment contribution/audit metadata may require a jurisdiction-specific retention period before launch; that policy must be supplied with the Hong Kong legal evidence.
- Operational errors are deleted after 90 days. Rate-limit, verification and export artifacts are deleted after expiry.

The production privacy policy and terms are published at stable HTTPS routes. Their final URLs, merchant legal name and support contact are mandatory inputs to `config/production-evidence.json` and block promotion while absent. Registration and registered-address details are not published by the application.
