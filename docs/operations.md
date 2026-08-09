# Cloudflare operations runbook

## 1. Create preview resources

Create separate preview D1 and Turnstile resources, then replace the preview D1 placeholder in `wrangler.jsonc`.

```sh
npx wrangler d1 create yi-db-preview
npm run db:migrate:preview
```

Onboard `rich-tide.com` in Cloudflare Email Sending. Restrict the Worker binding to `no-reply@rich-tide.com` for security mail, `hello@rich-tide.com` for welcome and acknowledgement mail, and `contact@rich-tide.com` for human replies. Route `contact@rich-tide.com` to a verified destination. Create a Turnstile widget restricted to `preview.yi.rich-tide.com`, store its public key in `.env.staging`, and its secret with Wrangler.

## 2. Configure optional identity providers

Better Auth email/password sign-in is the core account path. Google and Microsoft are optional: configure each provider only as a complete client-ID/client-secret pair. The UI hides any provider whose pair is absent. When enabling them, register these exact production callbacks:

- `https://yi.rich-tide.com/api/auth/callback/google`
- `https://yi.rich-tide.com/api/auth/callback/microsoft`

Use the corresponding preview origin for preview clients. Microsoft must request `openid profile email`; do not synthesize an address for profiles that do not return a deliverable email.

## 3. Configure optional Stripe payments

Use a Hong Kong Stripe account and HKD prices. Keep dynamic payment methods enabled in Stripe Dashboard so eligible cards, Alipay and WeChat Pay can be offered without hard-coded method lists.

Create a webhook endpoint at:

`https://yi.rich-tide.com/api/v1/webhooks/stripe`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. Redirect query parameters are display hints only; never use them as payment authority. Refunds are initiated from Stripe Dashboard, linked from the operations console.

## 4. Review and import sources

Follow [`catalog/README.md`](../catalog/README.md). Import the independently approved, rights-cleared trilingual catalog into preview first:

```sh
npm run release:catalog
npm run catalog:import:preview
```

Only after editorial verification should `CATALOG_REVIEWED` and `AI_ENABLED` become `true`. The DeepSeek adapter is fixed to `https://api.deepseek.com`, `deepseek-v4-flash`, the OpenAI-compatible Responses API, thinking enabled with `reasoning.effort: high`, no temperature and bounded structured output.

DeepSeek's Responses API is currently stateless: `previous_response_id`, `conversation`, and `store` are unsupported and silently ignored. Chat therefore resends its bounded history as a stable message prefix. DeepSeek's automatic context cache can reuse matching prefixes, and the adapter accounts for `usage.input_tokens_details.cached_tokens` at the provider's cache-hit rate. Do not switch chat to response-ID-only continuation until DeepSeek documents stateful support; doing so now would discard prior context.

## 5. Secrets

Set these core secrets separately in preview and production; never place them in Vite public environment files:

```text
DEEPSEEK_API_KEY
BETTER_AUTH_SECRET
TURNSTILE_SECRET
SHARE_SIGNING_KEY
ADMIN_EMAILS
```

Optional integrations use complete credential pairs. An absent pair disables and hides that integration; a partial pair fails the release gate:

```text
STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET
```

Use at least 32 random bytes for `BETTER_AUTH_SECRET` and `SHARE_SIGNING_KEY`. `ADMIN_EMAILS` is a comma-separated allowlist; promotion occurs only at account creation and all admin endpoints still verify the stored role.

## 6. Production promotion

1. Create `yi-db`, replace its D1 placeholder, and apply migrations.
2. Create the production Turnstile widget restricted to `yi.rich-tide.com`; put only its site key in `.env.production`.
3. Populate the core production secrets with `wrangler secret put --env production`; add optional credential pairs only when their acceptance checks are ready.
4. Import the approved catalog and confirm exactly 1,350 active entries.
5. Complete `config/production-evidence.json` from the example with legal identity, policy URLs and credentialed smoke-test timestamps.
6. Set production `CATALOG_REVIEWED` and `AI_ENABLED` true only after the preceding checks.
7. Run `npm run release:check`, `npm run check`, `npm run test:e2e`, and `npm run build:production`.
8. Dry-run the generated deployment config, deploy, then verify DNS/TLS and `/api/v1/status` at the custom domain.

```sh
npx wrangler deploy --dry-run --config dist/yi_web/wrangler.json
npm run deploy
```

The release gate fails closed on missing catalog approval, legal/acceptance evidence, placeholder D1 IDs, disabled production AI/catalog flags, a test Turnstile key, missing remote secrets, wrong compatibility settings, or an unpinned OpenAI package.

## 7. Routine operations

- The daily `0 3 * * *` trigger expires guest data, shares, rate limits, verifications, exports and old operational errors.
- Inspect content-redacted account, contribution, AI, latency, safety and error metadata in `/admin`.
- Change global AI enablement, token/spend budgets and concurrency in the admin console; invalid/missing values fail closed.
- Use structured Worker logs and request IDs. Do not add question, note, chat, source text, tokens or email bodies to logs.
