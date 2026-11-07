import { db } from "@/lib/db";
import { sendOpsAlert } from "@/lib/alerts";
import { enqueueDonation, enqueuePayout } from "@/lib/trail";
import type { Prisma } from "@/lib/generated/prisma/client";
import { donorPublicId } from "@/lib/privacy";
import { planFifoAllocation, toCents } from "@/lib/scoring";
import type { CapturedDonation } from "@/lib/paypal/orders";

/**
 * Pool ledger: donations in, payouts out, FIFO allocations linking the two.
 * Pool balance = Σ donation.remaining − Σ payouts still in flight (reserved).
 */

type Tx = Prisma.TransactionClient;

/** Payout statuses that still hold money from the pool (not yet allocated, not returned). */
export const RESERVED_PAYOUT_STATUSES = ["CREATED", "PENDING", "PROCESSING", "ONHOLD", "UNCLAIMED", "UNKNOWN"];

/** Statuses that mean a claim was verified (used for community vouching). */
export const VERIFIED_CLAIM_STATUSES = ["APPROVED", "WAITING_FUNDS", "PAYOUT_PENDING", "PAID", "ON_CHAIN"];

const POOL_LOCK_KEY = 7_505_001;

export async function lockPool(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${POOL_LOCK_KEY})`;
}

const cents = (d: Prisma.Decimal | number | string | null | undefined) => (d == null ? 0 : toCents(Number(d)));
export const usd = (c: number) => (c / 100).toFixed(2);

export async function poolBalanceCents(tx: Tx | typeof db = db): Promise<number> {
  const [don, reserved] = await Promise.all([
    tx.donation.aggregate({ _sum: { remainingUsd: true } }),
    tx.payout.aggregate({ _sum: { amountUsd: true }, where: { status: { in: RESERVED_PAYOUT_STATUSES } } }),
  ]);
  return cents(don._sum.remainingUsd) - cents(reserved._sum.amountUsd);
}

export async function poolSummary() {
  const [don, paid, count, balance] = await Promise.all([
    db.donation.aggregate({ _sum: { amountUsd: true } }),
    db.payout.aggregate({ _sum: { amountUsd: true }, where: { status: "SUCCESS" } }),
    db.donation.count(),
    poolBalanceCents(),
  ]);
  return {
    donatedCents: cents(don._sum.amountUsd),
    paidOutCents: cents(paid._sum.amountUsd),
    availableCents: balance,
    donations: count,
  };
}

/**
 * Save a COMPLETED capture as a donation. Idempotent on capture id, so the capture
 * route, the webhook and a retry can all call it safely.
 */
export async function recordDonation(cap: CapturedDonation, source: "paypal_button" | "sim_card", salt: string) {
  if (cap.captureStatus !== "COMPLETED") return { recorded: false as const, reason: `capture status ${cap.captureStatus}` };
  if (cap.currency !== "USD" || !(cap.amountUsd > 0)) return { recorded: false as const, reason: "unexpected currency/amount" };
  const amount = usd(toCents(cap.amountUsd));
  const donation = await db.donation.upsert({
    where: { paypalCaptureId: cap.captureId },
    update: {},
    create: {
      paypalOrderId: cap.orderId,
      paypalCaptureId: cap.captureId,
      donorPublicId: donorPublicId(salt, cap.payerKey ?? cap.captureId),
      amountUsd: amount,
      remainingUsd: amount,
      streamId: cap.streamId ?? "main",
      source,
    },
  });
  // Public trail entry (idempotent; sent in the background, never blocks the donation).
  await enqueueDonation(db, donation).catch((e) => console.error(`[trail] donation enqueue: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`));
  return { recorded: true as const, donation };
}

/**
 * Settle a payout once PayPal reports a final item status.
 * SUCCESS → FIFO allocations + claim PAID. Anything else final → claim PAYOUT_FAILED.
 * Safe to call more than once (poller and webhook may both report).
 */
export const FAILED_PAYOUT_STATUSES = ["FAILED", "UNCLAIMED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED"];

export async function settlePayout(payoutId: string, result: { itemStatus: string | null; payoutItemId: string | null; error: string | null }) {
  const settled = await settlePayoutTx(payoutId, result);
  if (FAILED_PAYOUT_STATUSES.includes(settled.status)) {
    const claim = await db.claim.findUnique({ where: { id: settled.claimId }, select: { claimPublicId: true } });
    await sendOpsAlert(
      { kind: "payout_failed", severity: "high", summary: `Payout for ${claim?.claimPublicId ?? "a claim"} ended ${settled.status}`, claimPublicId: claim?.claimPublicId, detail: `sender_batch_id ${settled.senderBatchId}; ${settled.error ?? ""}` },
      settled.id,
    );
  }
  return settled;
}

async function settlePayoutTx(payoutId: string, result: { itemStatus: string | null; payoutItemId: string | null; error: string | null }) {
  return db.$transaction(
    async (tx) => {
      await lockPool(tx);
      const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { allocations: true } });
      if (payout.status === "SUCCESS") return payout; // already settled

      const status = result.itemStatus ?? "UNKNOWN";
      if (status === "SUCCESS") {
        const donations = await tx.donation.findMany({
          where: { remainingUsd: { gt: 0 } },
          select: { id: true, remainingUsd: true, createdAt: true },
        });
        const plan = planFifoAllocation(
          donations.map((d) => ({ id: d.id, remainingCents: cents(d.remainingUsd), createdAt: d.createdAt })),
          cents(payout.amountUsd),
        );
        for (const p of plan) {
          await tx.allocation.create({ data: { donationId: p.donationId, payoutId: payout.id, amountUsd: usd(p.amountCents) } });
          await tx.donation.update({ where: { id: p.donationId }, data: { remainingUsd: { decrement: usd(p.amountCents) } } });
        }
        const paid = await tx.claim.update({ where: { id: payout.claimId }, data: { status: "PAID" }, select: { claimPublicId: true } });
        await enqueuePayout(tx, { id: payout.id, claimPublicId: paid.claimPublicId, amountUsd: payout.amountUsd, senderBatchId: payout.senderBatchId, payoutBatchId: payout.payoutBatchId, createdAt: payout.createdAt });
      } else if (FAILED_PAYOUT_STATUSES.includes(status)) {
        await tx.claim.update({ where: { id: payout.claimId }, data: { status: "PAYOUT_FAILED" } });
      }
      return tx.payout.update({
        where: { id: payout.id },
        data: { status, payoutItemId: result.payoutItemId ?? payout.payoutItemId, error: result.error },
      });
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}
