import type { Env } from "../env";
import type { ReservationResult } from "../durable/BudgetCoordinator";
import { ApiError } from "./errors";

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ApiError("AI_BUDGET_MISCONFIGURED", 503, `${name} is invalid.`);
  return parsed;
}

export async function reserveBudget(env: Env, input: {
  reservationId: string;
  identityKey: string;
  kind: "reflection" | "chat";
  registered: boolean;
  estimatedTokens: number;
  estimatedSpendMicros: number;
  enforceGlobal: boolean;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const coordinator = env.BUDGET.getByName(date);
  const configured = input.enforceGlobal
    ? await env.DB.prepare("SELECT key, value FROM app_config WHERE key IN ('global_daily_token_budget', 'global_daily_spend_micros', 'global_ai_max_concurrency')")
      .all<{ key: string; value: string }>()
    : { results: [] as Array<{ key: string; value: string }> };
  const config = new Map(configured.results.map((row) => [row.key, row.value]));
  const individualLimit = input.kind === "reflection"
    ? positiveInteger(input.registered ? env.USER_DAILY_REFLECTIONS : env.GUEST_DAILY_REFLECTIONS, "reflection limit")
    : positiveInteger(env.USER_DAILY_CHAT_TURNS, "chat limit");
  let result: ReservationResult;
  try {
    result = await coordinator.reserve({
      ...input,
      individualLimit,
      globalTokenLimit: input.enforceGlobal ? positiveInteger(config.get("global_daily_token_budget") ?? env.GLOBAL_DAILY_TOKEN_BUDGET, "token budget") : 1,
      globalSpendMicrosLimit: input.enforceGlobal ? positiveInteger(config.get("global_daily_spend_micros") ?? env.GLOBAL_DAILY_SPEND_MICROS, "spend budget") : 1,
      maxConcurrency: input.enforceGlobal ? positiveInteger(config.get("global_ai_max_concurrency") ?? env.AI_MAX_CONCURRENCY, "concurrency limit") : 1,
    });
  } catch {
    throw new ApiError("AI_BUDGET_UNAVAILABLE", 503, "AI budget coordination is unavailable.", true);
  }
  if (!result.ok) {
    const individual = result.code === "INDIVIDUAL_LIMIT";
    throw new ApiError(individual ? "DAILY_AI_LIMIT" : "GLOBAL_AI_LIMIT", 429, individual
      ? "Your daily AI allowance has been reached."
      : "The shared AI budget is currently unavailable.", true);
  }
  return {
    remaining: result.remaining,
    reconcile: async (actualTokens: number, actualSpendMicros: number, outcome: "success" | "failure") => {
      await coordinator.reconcile({ reservationId: input.reservationId, actualTokens, actualSpendMicros, outcome });
    },
  };
}
