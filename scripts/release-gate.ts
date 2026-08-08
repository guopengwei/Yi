import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { validateCatalog } from "./validate-catalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const evidenceSchema = z.object({
  schemaVersion: z.literal("yi-production-evidence@1"),
  legal: z.object({
    companyName: z.string().min(2),
    supportEmail: z.email(),
    privacyPolicyUrl: z.url().startsWith("https://"),
    termsUrl: z.url().startsWith("https://"),
  }).strict(),
  acceptance: z.object({
    stripeSandboxWebhookTestedAt: z.iso.datetime(),
    stripeLiveWebhookTestedAt: z.iso.datetime(),
    emailDeliveryTestedAt: z.iso.datetime(),
    emailPasswordTestedAt: z.iso.datetime(),
    googleOAuthTestedAt: z.iso.datetime(),
    microsoftOAuthTestedAt: z.iso.datetime(),
    httpsDomainVerifiedAt: z.iso.datetime(),
    turnstileHostnameVerifiedAt: z.iso.datetime(),
  }).strict(),
}).strict();

function parseSimpleEnv(source: string): Map<string, string> {
  return new Map(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1]!, match[2]!.trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

async function main() {
  await validateCatalog({ production: true });

  let evidenceRaw: string;
  try { evidenceRaw = await readFile(resolve(root, "config/production-evidence.json"), "utf8"); }
  catch { throw new Error("Production blocked: config/production-evidence.json is missing. Start from the example and attach completed legal/acceptance evidence."); }
  evidenceSchema.parse(JSON.parse(evidenceRaw));

  const config = JSON.parse(await readFile(resolve(root, "wrangler.jsonc"), "utf8")) as Record<string, any>;
  if (config.compatibility_date !== "2026-08-08" || !config.compatibility_flags?.includes("nodejs_compat")) {
    throw new Error("Production blocked: Worker compatibility configuration drifted.");
  }
  const production = config.env?.production;
  const databaseId = production?.d1_databases?.[0]?.database_id;
  if (!databaseId || /^(.)\1{7}-\1{4}-\1{4}-\1{4}-\1{12}$/.test(databaseId)) {
    throw new Error("Production blocked: replace the placeholder production D1 database ID.");
  }
  if (production?.vars?.CATALOG_REVIEWED !== "true" || production?.vars?.AI_ENABLED !== "true") {
    throw new Error("Production blocked: reviewed catalog and AI variables are not explicitly enabled.");
  }
  if (!production?.routes?.some((route: { pattern?: string; custom_domain?: boolean }) => route.pattern === "yi.rich-tide.com" && route.custom_domain === true)) {
    throw new Error("Production blocked: yi.rich-tide.com is not configured as the Worker custom domain.");
  }
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  if (packageJson.dependencies?.openai !== "7.4.0") throw new Error("Production blocked: openai must remain pinned to exactly 7.4.0.");

  let publicEnv: Map<string, string>;
  try { publicEnv = parseSimpleEnv(await readFile(resolve(root, ".env.production"), "utf8")); }
  catch { throw new Error("Production blocked: .env.production with the production Turnstile site key is missing."); }
  const siteKey = publicEnv.get("VITE_TURNSTILE_SITE_KEY");
  if (!siteKey || siteKey === "1x00000000000000000000AA") throw new Error("Production blocked: configure a non-test Turnstile site key restricted to yi.rich-tide.com.");

  const wrangler = resolve(root, "node_modules/.bin/wrangler");
  let secretOutput: string;
  try {
    secretOutput = execFileSync(wrangler, ["secret", "list", "--env", "production", "--format", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  } catch {
    throw new Error("Production blocked: Cloudflare production secrets could not be verified.");
  }
  const listed = z.array(z.object({ name: z.string() }).passthrough()).parse(JSON.parse(secretOutput));
  const names = new Set(listed.map((secret) => secret.name));
  const required = [
    "DEEPSEEK_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET",
    "TURNSTILE_SECRET", "SHARE_SIGNING_KEY", "ADMIN_EMAILS",
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Production blocked: missing Worker secrets: ${missing.join(", ")}`);
  console.log("Production release gate passed: catalog, legal evidence, acceptance evidence, domain, bindings, public widget, and secrets are complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
