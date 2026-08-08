import type { Env } from "../env";

export async function isProviderEnabled(env: Env): Promise<boolean> {
  if (env.AI_ENABLED !== "true" || env.CATALOG_REVIEWED !== "true") return false;
  const configured = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'global_ai_enabled'")
    .first<{ value: string }>();
  return configured?.value === "true";
}
