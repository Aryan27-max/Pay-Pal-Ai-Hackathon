import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Zapier Catch Hooks (see .claude/skills/zapier-alerts/SKILL.md). Two Zaps:
 *  - ZAPIER_REVIEW_WEBHOOK_URL: a claim needs a human (IN_REVIEW)
 *  - ZAPIER_ALERT_WEBHOOK_URL:  ops (pool low, payout failed/unclaimed, both AI providers down)
 * Fire-and-forget: 5 s timeout, never throws, never blocks the money flow, never logs the hook URL.
 * Payloads carry NO email, name, message, photo or exact GPS (pure builders below are tested for it).
 */
export type ReviewAlertInput = { claimPublicId: string; score: number; geoCell: string; redFlags: string[]; aiExplanation: string; reason: string };
export type OpsKind = "pool_low" | "payout_failed" | "ai_down";
export type OpsAlertInput = { kind: OpsKind; severity: "high" | "medium"; summary: string; claimPublicId?: string; detail?: string };

export function reviewPayload(a: ReviewAlertInput, baseUrl: string) {
  return {
    kind: "review_needed" as const,
    claim_public_id: a.claimPublicId,
    score: a.score,
    geo_cell: a.geoCell,
    red_flags: a.redFlags.slice(0, 10),
    reason: a.reason.slice(0, 300),
    ai_explanation: a.aiExplanation.slice(0, 600),
    review_url: `${baseUrl.replace(/\/+$/, "")}/review?claim=${encodeURIComponent(a.claimPublicId)}`,
    at: new Date().toISOString(),
  };
}

export function opsPayload(a: OpsAlertInput) {
  return {
    kind: a.kind,
    severity: a.severity,
    summary: a.summary.slice(0, 200),
    claim_public_id: a.claimPublicId ?? null,
    detail: (a.detail ?? "").slice(0, 400),
    at: new Date().toISOString(),
  };
}

export type AlertResult = "sent" | "duplicate" | "not_configured" | "failed";

/** Claim the dedupe key first (insert-or-skip), then POST. Never throws. */
async function post(url: string, key: string, kind: string, body: unknown): Promise<AlertResult> {
  if (!url) return "not_configured";
  try {
    await db.alertSent.create({ data: { key, kind } });
  } catch {
    return "duplicate"; // unique key already taken
  }
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
    if (res.ok) return "sent";
    console.error(`[alerts] ${kind} HTTP ${res.status}`);
  } catch (e) {
    console.error(`[alerts] ${kind} failed: ${e instanceof Error ? e.name : "error"}`);
  }
  await db.alertSent.delete({ where: { key } }).catch(() => undefined); // let a later attempt retry
  return "failed";
}

export async function sendReviewAlert(a: ReviewAlertInput): Promise<AlertResult> {
  const e = env();
  return post(e.ZAPIER_REVIEW_WEBHOOK_URL, `review:${a.claimPublicId}`, "review_needed", reviewPayload(a, e.APP_BASE_URL));
}

/** dedupeKey: e.g. `pool_low:<hour>` or `payout_failed:<payout id>`. */
export async function sendOpsAlert(a: OpsAlertInput, dedupeKey: string): Promise<AlertResult> {
  return post(env().ZAPIER_ALERT_WEBHOOK_URL, `${a.kind}:${dedupeKey}`, a.kind, opsPayload(a));
}

export const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
