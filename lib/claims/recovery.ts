import { db } from "@/lib/db";
import { sendOpsAlert } from "@/lib/alerts";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Recovery sweep (on startup and every 2 minutes, from instrumentation.ts). Idempotent and safe to run in
 * several processes at once:
 *  1. Claims stuck in RECEIVED / VERIFYING for > 5 min (process died mid-verification): leased with an atomic UPDATE
 *     (only one sweeper wins a claim), then verified again from the stored evidence. finalizeClaim only
 *     writes while the claim is still VERIFYING, so a claim is never decided twice. If the evidence is gone,
 *     the claim goes to IN_REVIEW with that reason (never rejected for our failure).
 *  2. Claims APPROVED for > 5 min with no payout (died between decision and payout): send_payout again.
 *     sendPayout re-checks everything under the pool lock and sender_batch_id is unique, so no double payout.
 *  3. Payouts stuck in CREATED (died between reserving and calling PayPal): marked UNKNOWN with an ops
 *     alert. We never re-send blindly: the reserved amount stays held until a human checks PayPal.
 */
export const STUCK_AFTER_MS = 5 * 60_000;

export type RecoveryReport = { reverified: string[]; toReview: string[]; payoutsRestarted: string[]; payoutsFlagged: string[] };

type Deps = {
  reverify: (claimId: string) => Promise<unknown>;
  payout: (claimId: string) => Promise<unknown>;
};

/** Atomically take a stuck claim: true for exactly one caller. */
async function lease(claimId: string): Promise<boolean> {
  const n = await db.$executeRaw`UPDATE claim SET updated_at = now()
    WHERE id = ${claimId}::uuid AND status IN ('RECEIVED', 'VERIFYING') AND updated_at < now() - (${STUCK_AFTER_MS / 1000} * interval '1 second')`;
  return n === 1;
}

export async function recoverStuckClaims(deps: Deps): Promise<RecoveryReport> {
  const report: RecoveryReport = { reverified: [], toReview: [], payoutsRestarted: [], payoutsFlagged: [] };
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  // 1. RECEIVED / VERIFYING too long
  const stuck = await db.claim.findMany({ where: { status: { in: ["RECEIVED", "VERIFYING"] }, updatedAt: { lt: cutoff } }, select: { id: true, claimPublicId: true }, take: 20 });
  for (const c of stuck) {
    if (!(await lease(c.id))) continue;
    const hasEvidence = (await db.claimEvidence.count({ where: { claimId: c.id } })) > 0;
    if (!hasEvidence) {
      const moved = await db.$transaction(async (tx) => {
        const u = await tx.claim.updateMany({ where: { id: c.id, status: { in: ["RECEIVED", "VERIFYING"] } }, data: { status: "IN_REVIEW", aiExplanation: "Verification was interrupted and the evidence is no longer available. Needs a human." } });
        if (u.count !== 1) return false;
        await tx.decision.create({ data: { claimId: c.id, actor: "engine", outcome: "IN_REVIEW", reason: "recovery: verification interrupted and evidence missing; needs a human (never auto-rejected for our failure)" } });
        return true;
      });
      if (moved) report.toReview.push(c.claimPublicId);
      continue;
    }
    try {
      await deps.reverify(c.id);
      report.reverified.push(c.claimPublicId);
    } catch (e) {
      console.error(`[recovery] ${c.claimPublicId}: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
    }
  }

  // 2. APPROVED with no payout
  const approved = await db.claim.findMany({ where: { status: "APPROVED", updatedAt: { lt: cutoff }, payouts: { none: {} } }, select: { id: true, claimPublicId: true }, take: 20 });
  for (const c of approved) {
    try {
      await deps.payout(c.id);
      report.payoutsRestarted.push(c.claimPublicId);
    } catch (e) {
      console.error(`[recovery] payout ${c.claimPublicId}: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
    }
  }

  // 3. Payouts reserved but never sent
  const created = await db.payout.findMany({ where: { status: "CREATED", payoutBatchId: null, updatedAt: { lt: cutoff } }, include: { claim: { select: { claimPublicId: true } } }, take: 20 });
  for (const p of created) {
    const u = await db.payout.updateMany({ where: { id: p.id, status: "CREATED" }, data: { status: "UNKNOWN", error: "recovery: process stopped between reserving and calling PayPal; check PayPal for this sender_batch_id before retrying" } });
    if (u.count === 1) {
      report.payoutsFlagged.push(p.senderBatchId);
      await sendOpsAlert({ kind: "payout_failed", severity: "high", summary: `Payout ${p.senderBatchId} needs a manual check`, claimPublicId: p.claim.claimPublicId, detail: "Reserved but not confirmed sent. Check PayPal; no automatic re-send." }, `recovery:${p.id}`);
    }
  }
  return report;
}

let started = false;

/** Called once per server process from instrumentation.ts (Node runtime only). */
export function startRecoveryLoop(deps: () => Promise<Deps>, everyMs = 2 * 60_000): void {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const r = await recoverStuckClaims(await deps());
      const n = r.reverified.length + r.toReview.length + r.payoutsRestarted.length + r.payoutsFlagged.length;
      if (n) console.log(`[recovery] ${JSON.stringify(r)}`);
    } catch (e) {
      // DB not migrated yet / not reachable: try again next tick.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError)) console.error(`[recovery] sweep failed: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, everyMs).unref?.();
}
