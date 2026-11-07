import { Render } from "@renderinc/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { retryWaitingFunds, sendPayout, type SendPayoutResult } from "./send-payout";
import { verifyClaimInline, type FinalizeResult } from "./verify-claim";

/**
 * Where background work runs (see .claude/skills/render-workflows/SKILL.md):
 *  - RENDER_WORKFLOW_SERVICE_ID + RENDER_WORKFLOW_SLUG set → Render Workflows task runs (durable, retried)
 *  - otherwise → the same functions inline (local dev, tests)
 * Task ids are "<RENDER_WORKFLOW_SLUG>/<task name>"; names are registered in workflows/render.ts.
 */
export const TASKS = {
  verify: "verify_claim",
  payout: "send_payout",
  release: "release_waiting_funds",
} as const;

export function workflowsEnabled(): boolean {
  const e = env();
  return Boolean(e.RENDER_WORKFLOW_SERVICE_ID && e.RENDER_WORKFLOW_SLUG && e.RENDER_API_KEY);
}

let render: Render | undefined;
const client = () => (render ??= new Render({ token: env().RENDER_API_KEY }));
const slug = (name: string) => `${env().RENDER_WORKFLOW_SLUG}/${name}`;

export type VerifyDispatch =
  | { mode: "inline"; result: FinalizeResult; payout: SendPayoutResult | null }
  | { mode: "workflow"; taskRunId: string };

/** Start verification. Inline mode also pays an APPROVED claim right away (as Phase 1 did). */
export async function dispatchVerify(claimId: string): Promise<VerifyDispatch> {
  if (workflowsEnabled()) {
    const run = await client().workflows.startTask(slug(TASKS.verify), [claimId], { idempotencyKey: `verify-${claimId}` });
    return { mode: "workflow", taskRunId: run.taskRunId };
  }
  const result = await verifyClaimInline(claimId);
  const payout = result.decision.outcome === "APPROVED" && !result.alreadyDecided ? await sendPayout(claimId) : null;
  return { mode: "inline", result, payout };
}

/** After a reviewer approves. Idempotency key per payout attempt, so a retry after FAILED can start. */
export async function dispatchPayout(claimId: string): Promise<{ mode: "inline"; payout: SendPayoutResult } | { mode: "workflow"; taskRunId: string }> {
  if (workflowsEnabled()) {
    const attempts = await db.payout.count({ where: { claimId } });
    const run = await client().workflows.startTask(slug(TASKS.payout), [claimId], { idempotencyKey: `payout-${claimId}-${attempts + 1}` });
    return { mode: "workflow", taskRunId: run.taskRunId };
  }
  return { mode: "inline", payout: await sendPayout(claimId) };
}

/** After every recorded donation. send-payout re-checks the pool under the advisory lock, so overlapping runs are safe. */
export async function dispatchRelease(opts: { waitMs?: number } = {}) {
  if (workflowsEnabled()) {
    const run = await client().workflows.startTask(slug(TASKS.release), []);
    return { mode: "workflow" as const, taskRunId: run.taskRunId };
  }
  return { mode: "inline" as const, released: await retryWaitingFunds(opts) };
}
