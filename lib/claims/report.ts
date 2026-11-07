import { db } from "@/lib/db";

/**
 * Operator/reviewer view of one claim: signals, evidence details, the engine decision and the latest
 * payout. Used by POST /api/claims (inline mode) and GET /api/claims/:publicId?detail=1 (token required).
 * Never includes the email, exact GPS, the message, the transcript or the Kernel replay URL.
 */
export async function claimReport(where: { id: string } | { claimPublicId: string }) {
  const c = await db.claim.findUnique({
    where,
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      payouts: { orderBy: { attempt: "desc" }, take: 1 },
    },
  });
  if (!c) return null;
  const engine = [...c.decisions].reverse().find((d) => d.actor === "engine");
  const s = (c.signals ?? {}) as Record<string, unknown> & { detail?: Record<string, unknown> };
  const p = c.payouts[0];
  const ai = (s.detail?.ai ?? null) as null | { calls?: { gemini: number; groq: number }; scores?: unknown; redFlags?: string[] };
  return {
    claimPublicId: c.claimPublicId,
    status: c.status,
    outcome: engine?.outcome ?? null,
    score: c.score,
    reason: engine?.reason ?? null,
    signals: { photo: s.photo ?? null, location: s.location ?? null, message: s.message ?? null, uniqueness: s.uniqueness ?? null, vouching: s.vouching ?? null },
    detail: s.detail ?? null,
    explanation: c.aiExplanation ?? "",
    ai: {
      provider: c.aiProvider,
      model: c.aiModel,
      cached: c.aiCached,
      calls: ai?.calls ?? { gemini: 0, groq: 0 },
      scores: ai?.scores ?? null,
      redFlags: ai?.redFlags ?? [],
    },
    eventSource: c.eventSource,
    kernelStatus: c.kernelStatus,
    decisions: c.decisions.map((d) => ({ actor: d.actor, outcome: d.outcome, score: d.score, reason: d.reason, at: d.createdAt.toISOString() })),
    payout: p ? { senderBatchId: p.senderBatchId, payoutBatchId: p.payoutBatchId, status: p.status, amountUsd: Number(p.amountUsd).toFixed(2) } : null,
  };
}

export type ClaimReport = NonNullable<Awaited<ReturnType<typeof claimReport>>>;
