# API v1 contract

All application endpoints are under `/api/v1`; Better Auth owns `/api/auth/*`. JSON errors use a stable shape:

```json
{"error":{"code":"STABLE_MACHINE_CODE","message":"Human-readable summary","retryable":false},"requestId":"…"}
```

Mutation retries that can create money, reading, chat or share state use cryptographic UUID idempotency keys. Ownership is derived from the authenticated session or signed guest cookie—never from a request body user ID.

Localized requests send `X-Yi-Locale: zh-HK | zh-CN | en`. Ready reading responses include only the matching approved Takashima entries. New readings snapshot all three locales; a legacy single-locale reading resolves the requested translation from the same immutable catalog release.

## Reading lifecycle

`awaiting_contribution → payment_pending → ready`

- `POST /readings` creates reproducible facts but does not reveal them yet.
- `POST /readings/:id/contribution` with HK$0 moves directly to `ready`.
- Positive HK$1–888 creates Stripe Checkout and moves to `payment_pending`.
- Only a signature-verified, environment-matched webhook with exact session, reading, contribution, HKD amount and paid status can move it to `ready`.
- Expired or failed asynchronous Checkout returns it to `awaiting_contribution`; refunds update contribution metadata but do not erase an already delivered deterministic reading.

## Endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/status` | public | deterministic, catalog and AI feature status |
| POST | `/readings` | guest/user | create a versioned cast |
| GET | `/readings/:id` | owner | poll state and reveal ready facts plus the locale-matched Takashima interpretation |
| POST | `/readings/:id/contribution` | owner | HK$0 completion or Stripe Checkout |
| POST | `/readings/:id/reflection` | owner + explicit consent | deterministic fallback or source-grounded reflection |
| POST | `/readings/:id/archive` | user | explicitly save a reading |
| POST | `/webhooks/stripe` | Stripe signature | authoritative payment events |
| GET | `/history` | user | list archives |
| GET | `/history/search?q=` | user | owner-scoped FTS5 search |
| GET/PATCH/DELETE | `/history/:id` | owner | read, rename or individually delete |
| POST | `/history/:id/notes` | owner | add note |
| PATCH/DELETE | `/history/:archiveId/notes/:noteId` | owner | edit/delete note |
| GET/POST | `/chats` | user | list or create and archive a conversation |
| GET | `/chats/:id/messages?after=` | owner | resume messages by sequence |
| GET | `/chats/:id/socket?after=` | owner | authenticated Hibernation WebSocket |
| DELETE | `/chats/:id` | owner | permanently delete one conversation |
| GET/POST | `/shares` | user | list/create opaque seven-day snapshots |
| GET | `/shares/public/:token` | public | anonymous, no-store share payload |
| DELETE | `/shares/:id` | owner | revoke a share |
| GET | `/account/profile` | user | profile and settings |
| PATCH | `/account/settings` | user | locale, theme and font size |
| POST | `/account/claim-guest` | user | claim recent signed guest readings after login |
| GET | `/account/export` | user | export owned account data |
| POST | `/contact` | guest/user | rate-limited contact request and receipt |
| GET/PATCH | `/admin/*` | admin | content-redacted operations and limits |

AI operation bodies require `consent: true` and `includeReadingFacts: true`, with booleans recording whether the question and source material are included. Ready-reading responses return the stored `aiConsentScope` after the first AI operation so interpretation and chat can reuse it without another prompt. High-stakes routing always bypasses the provider. A reflection generated with the original question is excluded from anonymous share snapshots.

## Limits

- guest reflections: 1 per UTC date
- registered reflections: 5 per UTC date
- registered chat turns: 50 per UTC date
- share expiry: 7 days
- unsaved guest operations: at most 7 days

The budget Durable Object atomically reserves and reconciles individual count, global token, spend and concurrency capacity. Missing or invalid global configuration fails closed while deterministic casts remain available.
