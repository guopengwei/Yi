# Yi · 易

Yi is a trilingual, responsive reflection application for `yi.rich-tide.com`. It combines a deterministic, single-changing-line casting method with directly mapped Takashima interpretations, voluntary HKD contributions, explicit-consent DeepSeek reflections, private archives and notes, persistent reading chats, anonymous seven-day shares, and a content-redacted operations console.

The application is greenfield. `ReferenceProg/` is ignored and is neither imported nor deployed. The deterministic King Wen identifiers and mappings live in [`shared/catalog.ts`](shared/catalog.ts). Approved Takashima excerpts are snapshotted in Traditional Chinese, Simplified Chinese and English, then selected by request locale without an LLM call.

## Stack

- React 19, TypeScript, Vite, React Router, i18next and Zod
- Hono on one Cloudflare Worker with Static Assets
- D1 for auth, readings, payments, archives, notes, full-text search, shares and operations metadata
- Better Auth for verified email/password, Google and Microsoft sign-in
- one SQLite Durable Object per chat and a date-scoped Durable Object for atomic AI budgets
- Stripe-hosted Checkout with dynamic payment methods and webhook authority
- Cloudflare Email Service and Turnstile
- `openai@7.4.0`, pinned exactly, with a server-only DeepSeek adapter

## Local development

Requires Node 22 or newer.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The build deliberately sets `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`; Vite must never bundle Worker secrets from `.env` files. Put local Worker secrets in `.dev.vars` and only the public Turnstile site key in `.env`.

Useful checks:

```sh
npm run check
npm run test:e2e
npm run cf:typegen
npm run release:check
```

`npm run release:check` is expected to fail in this repository until the reviewed 1,350-entry source catalog, Hong Kong legal identity, production policy URLs, acceptance evidence, real Cloudflare IDs, public Turnstile key and remote secrets are supplied.

## Project map

- [`src/`](src/) — localized SPA and client-side long-image/QR sharing
- [`worker/`](worker/) — API, auth, payments, mail, AI, safety, and Durable Objects
- [`shared/`](shared/) — strict contracts and deterministic casting core
- [`migrations/`](migrations/) — D1 schema and release-safe upgrades
- [`tests/`](tests/) and [`tests-worker/`](tests-worker/) — deterministic, provider, payment, email, D1 and DO contracts
- [`e2e/`](e2e/) — desktop/mobile, locale, accessibility and reduced-motion acceptance checks
- [`catalog/`](catalog/) — rights/provenance schema and catalog release process
- [`docs/operations.md`](docs/operations.md) — preview and production setup runbook
- [`docs/api.md`](docs/api.md) — v1 API and lifecycle contract
- [`docs/privacy-and-retention.md`](docs/privacy-and-retention.md) — data boundaries and retention

Subscriptions and Premium entitlements are intentionally disabled in v1. AI fair-use limits remain operational safeguards, not paid entitlements.
