import { db } from "@/lib/db";
import { SIMULATED_EVENT } from "@/lib/disasters";
import { explorerTxUrl } from "@/lib/trail";

/**
 * A donor's receipt (public: the donor id is an HMAC, nothing else identifies anyone).
 * For each donation: where every dollar went (FIFO allocations) → which claim, which disaster, when it was
 * verified and by whom (engine or reviewer), the PayPal payout, and the Solana records of the donation,
 * the approval and the payout.
 */
const short = (claimPublicId: string) => claimPublicId.slice(2, 6).toUpperCase();
const eventName = (id: string | null) =>
  !id ? "disaster zone" : id === SIMULATED_EVENT.id ? SIMULATED_EVENT.name.replace(/\s*\(SIMULATED[^)]*\)/i, "") : id.startsWith("gdacs:") ? `GDACS event ${id.split(":")[2]}` : id;

export async function donorReceipt(donorPublicId: string) {
  if (!/^d_[0-9a-f]{20}$/.test(donorPublicId)) return null;
  const donations = await db.donation.findMany({
    where: { donorPublicId },
    orderBy: { createdAt: "asc" },
    include: {
      allocations: {
        include: {
          payout: {
            include: { claim: { select: { id: true, claimPublicId: true, geoCell: true, disasterEventId: true, decisions: { where: { outcome: "APPROVED" }, orderBy: { createdAt: "asc" }, take: 1 } } } },
          },
        },
      },
    },
  });
  if (!donations.length) return null;
  const ids = [
    ...donations.map((d) => d.id),
    ...donations.flatMap((d) => d.allocations.map((a) => a.payout.id)),
    ...donations.flatMap((d) => d.allocations.flatMap((a) => a.payout.claim.decisions.map((x) => x.id))),
  ];
  const trail = await db.trailEntry.findMany({ where: { refId: { in: ids } } });
  const link = (refId: string) => {
    const t = trail.find((x) => x.refId === refId);
    return t ? { status: t.status, url: t.status === "CONFIRMED" && t.signature ? explorerTxUrl(t.signature) : null, memo: t.memo } : null;
  };

  return {
    donor: donorPublicId,
    donations: donations.map((d) => ({
      at: d.createdAt.toISOString(),
      amountUsd: Number(d.amountUsd).toFixed(2),
      stillInPoolUsd: Number(d.remainingUsd).toFixed(2),
      paypalOrderId: d.paypalOrderId,
      paypalCaptureId: d.paypalCaptureId,
      record: link(d.id),
      reached: d.allocations.map((a) => {
        const approval = a.payout.claim.decisions[0];
        return {
          amountUsd: Number(a.amountUsd).toFixed(2),
          claim: a.payout.claim.claimPublicId,
          claimShort: short(a.payout.claim.claimPublicId),
          event: eventName(a.payout.claim.disasterEventId),
          simulatedEvent: a.payout.claim.disasterEventId === SIMULATED_EVENT.id,
          cell: a.payout.claim.geoCell,
          verifiedAt: approval?.createdAt.toISOString() ?? null,
          verifiedBy: approval ? (approval.actor === "engine" ? "verification engine" : "human reviewer") : null,
          score: approval?.score ?? null,
          paidAt: a.payout.updatedAt.toISOString(),
          payoutStatus: a.payout.status,
          paypalPayoutBatchId: a.payout.payoutBatchId,
          approvalRecord: approval ? link(approval.id) : null,
          payoutRecord: link(a.payout.id),
        };
      }),
    })),
  };
}

export type DonorReceipt = NonNullable<Awaited<ReturnType<typeof donorReceipt>>>;
