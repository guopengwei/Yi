import type { BudgetCoordinator } from "./durable/BudgetCoordinator";
import type { ReadingChat } from "./durable/ReadingChat";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EMAIL: SendEmail;
  CHAT: DurableObjectNamespace<ReadingChat>;
  BUDGET: DurableObjectNamespace<BudgetCoordinator>;
  APP_ENV: "development" | "preview" | "production";
  APP_ORIGIN: string;
  ALLOWED_TURNSTILE_HOSTNAMES: string;
  EMAIL_FROM: string;
  SUPPORT_EMAIL: string;
  CATALOG_REVIEWED: string;
  AI_ENABLED: string;
  GLOBAL_DAILY_TOKEN_BUDGET: string;
  GLOBAL_DAILY_SPEND_MICROS: string;
  AI_MAX_CONCURRENCY: string;
  GUEST_DAILY_REFLECTIONS: string;
  USER_DAILY_REFLECTIONS: string;
  USER_DAILY_CHAT_TURNS: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  TURNSTILE_SECRET?: string;
  DEEPSEEK_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SHARE_SIGNING_KEY?: string;
  ADMIN_EMAILS?: string;
}

export interface AppVariables {
  requestId: string;
}

