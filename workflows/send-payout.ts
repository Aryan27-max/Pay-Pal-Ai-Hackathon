import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hourKey, sendOpsAlert } from "@/lib/alerts";
import { lockPool, poolBalanceCents, settlePayout, usd } from "@/lib/ledger";
import { PayPalError } from "@/lib/paypal/client";
import { createPayout, senderBatchId, waitForPayout, type PayoutResult } from "@/lib/paypal/payouts";
import { packetFor, planWaitingFundsRelease, scoringConfigFrom } from "@/lib/scoring";

/**
 * send_payout(claim_id). A Render Workflows task (workflows/render.ts), or inline when Workflows is off.
 *
 * Guards (hard rules 1–3):
 *  - The claim's latest decision must be APPROVED (made by lib/scoring or a reviewer approve).
 *  - Amount comes only from lib/scoring.packetFor (default, ≤ max, ≤ pool). Nobody passes an amount in.
 *  - Recipient is the claim's own PayPal email. Nobody passes a recipient in.
 *  - sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>; unique per claim record + attempt.
 */
export type SendPayoutResult =
  | { kind: "SENT"; payoutId: string; senderBatchId: string; payoutBatchId: string; result: PayoutResult }
  | { kind: "WAITING_FUNDS"; neededCents: number; poolCents: number }
  | { kind: "FAILED"; payoutId: string; error: string }
  | { kind: "SKIPPED"; reason: string };

const PAYABLE_STATES = ["APPROVED", "WAITING_FUNDS", "PAYOUT_FAILED"];

export async function sendPayout(claimId: string, opts: { waitMs?: number } = {}): Promise<SendPayoutResult> {
  const cfg = scoringConfigFrom(env());

  // 1) Reserve: check the decision, size the packet, create the Payout row — all under the pool lock.
  const reserved = await db.$transaction(
    async (tx) => {
      await lockPool(tx);
      const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });
      if (!PAYABLE_STATES.includes(claim.status)) return { kind: "SKIPPED" as const, reason: `claim status ${claim.status}` };
      const last = await tx.decision.findFirst({ where: { claimId }, orderBy: { createdAt: "desc" } });
      if (last?.outcome !== "APPROVED") return { kind: "SKIPPED" as const, reason: "latest decision is not APPROVED" };
      const inFlight = await tx.payout.count({ where: { claimId, status: { in: ["CREATED", "PENDING", "PROCESSING", "SUCCESS"] } } });
      if (inFlight > 0) return { kind: "SKIPPED" as const, reason: "payout already in flight or paid" };

      const pool = await poolBalanceCents(tx);
      const packet = packetFor(cfg, pool);
      if (packet.kind === "WAITING_FUNDS") {
        await tx.claim.update({ where: { id: claimId }, data: { status: "WAITING_FUNDS" } });
        return packet;
      }
      const attempt = (await tx.payout.count({ where: { claimId } })) + 1;
      const sbid = senderBatchId(claim.claimPublicId, claim.id, attempt);
      const payout = await tx.payout.create({
        data: { claimId, attempt, senderBatchId: sbid, amountUsd: usd(packet.amountCents), status: "CREATED" },
      });
      await tx.claim.update({ where: { id: claimId }, data: { status: "PAYOUT_PENDING" } });
      return {
        kind: "RESERVED" as const,
        payoutId: payout.id,
        senderBatchId: sbid,
        amountCents: packet.amountCents,
        email: claim.paypalEmail,
        claimPublicId: claim.claimPublicId,
      };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  if (reserved.kind !== "RESERVED") return reserved;

  // 2) Send to PayPal.
  let payoutBatchId: string;
  try {
    const r = await createPayout({
      senderBatchId: reserved.senderBatchId,
      receiverEmail: reserved.email,
      amountCents: reserved.amountCents,
      claimPublicId: reserved.claimPublicId,
    });
    payoutBatchId = r.payoutBatchId;
    await db.payout.update({ where: { id: reserved.payoutId }, data: { payoutBatchId, status: "PENDING" } });
  } catch (err) {
    const error = err instanceof PayPalError ? err.message : `payout request failed: ${(err as Error).message}`;
    await db.payout.update({ where: { id: reserved.payoutId }, data: { status: "FAILED", error: error.slice(0, 500) } });
    await db.claim.update({ where: { id: claimId }, data: { status: "PAYOUT_FAILED" } });
    return { kind: "FAILED", payoutId: reserved.payoutId, error };
  }

  // 3) Poll until final (webhooks also settle it if they arrive first).
  const result = await waitForPayout(payoutBatchId, { timeoutMs: opts.waitMs ?? 60_000 });
  if (result.final) await settlePayout(reserved.payoutId, result);
  else await db.payout.update({ where: { id: reserved.payoutId }, data: { payoutItemId: result.payoutItemId } });

  await alertIfPoolLow();
  return { kind: "SENT", payoutId: reserved.payoutId, senderBatchId: reserved.senderBatchId, payoutBatchId, result };
}

/** Ops alert (at most one per hour) when the pool drops below POOL_LOW_USD. Never throws. */
export async function alertIfPoolLow(): Promise<void> {
  try {
    const pool = await poolBalanceCents(db);
    const min = Math.round(env().POOL_LOW_USD * 100);
    if (pool < min) {
      await sendOpsAlert({ kind: "pool_low", severity: "medium", summary: `Relief pool is $${usd(pool)} (below $${usd(min)})`, detail: "New claims will wait for funds." }, hourKey());
    }
  } catch {
    /* alerts never block payouts */
  }
}

/** Re-poll payouts still PENDING (e.g. after a timeout) and settle the final ones. */
export async function syncPendingPayouts(): Promise<{ checked: number; settled: number }> {
  const pending = await db.payout.findMany({ where: { status: { in: ["PENDING", "PROCESSING", "ONHOLD", "UNKNOWN"] }, payoutBatchId: { not: null } } });
  let settled = 0;
  for (const p of pending) {
    const r = await waitForPayout(p.payoutBatchId!, { timeoutMs: 1 });
    if (r.final) {
      await settlePayout(p.id, r);
      settled++;
    }
  }
  return { checked: pending.length, settled };
}

export type ReleasedClaim = { claimPublicId: string; result: SendPayoutResult };

let releaseRunning: Promise<ReleasedClaim[]> | null = null;
let releaseAgain = false;

/**
 * Called after every recorded donation (button capture, webhook, simulator).
 * Pays WAITING_FUNDS claims strictly oldest first, as far as the pool covers full packets
 * (lib/scoring.planWaitingFundsRelease). sendPayout re-checks the decision and the pool under
 * the advisory lock, so a stale plan can never overspend; it just stops at WAITING_FUNDS again.
 * Single-flight per process: a donation that lands mid-run triggers one more pass.
 */
export async function retryWaitingFunds(opts: { waitMs?: number } = {}): Promise<ReleasedClaim[]> {
  if (releaseRunning) {
    releaseAgain = true;
    return releaseRunning;
  }
  releaseRunning = (async () => {
    const released: ReleasedClaim[] = [];
    try {
      do {
        releaseAgain = false;
        const cfg = scoringConfigFrom(env());
        const waiting = await db.claim.findMany({
          where: { status: "WAITING_FUNDS" },
          select: { id: true, claimPublicId: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (!waiting.length) break;
        const plan = planWaitingFundsRelease(cfg, await poolBalanceCents(db), waiting);
        for (const id of plan) {
          const result = await sendPayout(id, opts);
          released.push({ claimPublicId: waiting.find((w) => w.id === id)!.claimPublicId, result });
          if (result.kind === "WAITING_FUNDS") break;
        }
      } while (releaseAgain);
    } finally {
      releaseRunning = null;
    }
    return released;
  })();
  return releaseRunning;
}
