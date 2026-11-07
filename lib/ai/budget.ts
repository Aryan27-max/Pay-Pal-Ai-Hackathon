import { db } from "@/lib/db";

/**
 * AI cost guard (zero-cost rule): a per-provider daily call budget, safely under the free tiers.
 *   AI_DAILY_CALL_BUDGET_GEMINI (default 400; Flash-Lite free tier ≈ 500/day)
 *   AI_DAILY_CALL_BUDGET_GROQ   (default 800; covers Groq vision + Whisper together; free tier ≈ 1K/2K a day)
 * reserve() increments the counter atomically and only while it is under the budget, so concurrent claims
 * can never overshoot. At the budget lib/ai falls back to the next provider; if none is left the claim
 * goes to IN_REVIEW with the reason. Counted per UTC day (free-tier quotas reset daily).
 */
export type BudgetProvider = "gemini" | "groq";

export const DEFAULT_BUDGET: Record<BudgetProvider, number> = { gemini: 400, groq: 800 };

export function dailyBudget(p: BudgetProvider, env: Record<string, string | undefined> = process.env): number {
  const raw = env[p === "gemini" ? "AI_DAILY_CALL_BUDGET_GEMINI" : "AI_DAILY_CALL_BUDGET_GROQ"];
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_BUDGET[p];
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export type BudgetGuard = {
  /** true = one call reserved; false = today's budget is used up. */
  reserve(p: BudgetProvider): Promise<boolean>;
};

export const dbBudget: BudgetGuard = {
  async reserve(p) {
    const limit = dailyBudget(p);
    const rows = await db.$queryRaw<{ calls: number }[]>`
      INSERT INTO ai_usage (day, provider, calls, updated_at) VALUES (${utcDay()}, ${p}, 1, now())
      ON CONFLICT (day, provider) DO UPDATE SET calls = ai_usage.calls + 1, updated_at = now()
      WHERE ai_usage.calls < ${limit}
      RETURNING calls`;
    return rows.length === 1;
  },
};

/** Today's usage for /admin and the demo report. */
export async function usageToday(): Promise<Array<{ provider: BudgetProvider; calls: number; budget: number }>> {
  const rows = await db.aiUsage.findMany({ where: { day: utcDay() } });
  return (["gemini", "groq"] as const).map((p) => ({ provider: p, calls: rows.find((r) => r.provider === p)?.calls ?? 0, budget: dailyBudget(p) }));
}

export const budgetExhaustedMessage = (p: BudgetProvider) => `daily call budget reached (${dailyBudget(p)}/${dailyBudget(p)} today, AI_DAILY_CALL_BUDGET_${p.toUpperCase()})`;
