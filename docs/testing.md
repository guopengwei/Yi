# Verification matrix

## Automated

`npm run check` runs TypeScript, unit tests, Worker integration tests, a production-style build and the non-production catalog validator.

The deterministic suite exhaustively checks:

- all 64 primary patterns;
- all 384 single-line changes;
- exactly one changing line for every accepted cast;
- exact, fail-closed mapping from that line to its reviewed Takashima excerpt;
- trilingual source snapshots, per-request locale selection and same-release recovery for legacy readings;
- rejection of removed multi-line casting methods;
- strict invalid-input rejection.

Worker tests cover guest ownership/idempotency, HK$0 state transitions, owner-scoped FTS, signed/mismatched/replayed Stripe webhooks, budget reservation/reconciliation, and immutable owner-scoped Durable Object chat context. Provider tests assert the exact DeepSeek thinking request, absence of temperature, bounded output, consent bypass, fabricated-source rejection and prompt-sized budget estimation. Transactional mail templates are checked in all three locales.

`npm run test:e2e` runs desktop and mobile Chromium against the real Vite/Worker integration. It exercises the reviewed three-number/HK$0 flow, live locale switching for the directly mapped Takashima text without an AI request, default and persisted locale behavior, serious/critical axe checks, keyboard skip navigation, reduced motion and horizontal overflow in all locales.

## Credentialed acceptance before production

These cannot be meaningfully completed with repository placeholders and must be recorded in `config/production-evidence.json`:

1. Stripe sandbox webhook, delayed/replayed event and eligible payment-method smoke tests.
2. Stripe live HKD Checkout plus live webhook smoke test.
3. Cloudflare Email Service delivery for verification, reset, welcome, contact and deletion mail.
4. Verified email/password, Google and Microsoft sign-in callbacks; confirm Microsoft profiles without deliverable email are refused.
5. Turnstile on the exact production hostname and protected actions.
6. HTTPS/TLS and custom-domain behavior at `yi.rich-tide.com`.
7. Account export/deletion and admin authorization against production-like data.

Run the full gate immediately before promotion:

```sh
npm run release:check
npm run build:production
npx wrangler deploy --dry-run --config dist/yi_web/wrangler.json
```
