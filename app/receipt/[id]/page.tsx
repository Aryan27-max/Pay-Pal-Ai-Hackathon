import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Basic donor receipt (Phase 1). Phase 3 adds Solana explorer links and the polished view. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^d_[0-9a-f]{20}$/.test(id)) notFound();
  const donations = await db.donation.findMany({
    where: { donorPublicId: id },
    orderBy: { createdAt: "asc" },
    include: {
      allocations: {
        include: { payout: { select: { status: true, createdAt: true, payoutBatchId: true, claim: { select: { claimPublicId: true, geoCell: true, disasterEventId: true } } } } },
      },
    },
  });
  if (donations.length === 0) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Your receipt</h1>
      <p className="text-sm text-slate-600">Donor <code>{id}</code>. Anonymous: we never store your email.</p>
      {donations.map((d) => (
        <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold">${Number(d.amountUsd).toFixed(2)} donated</div>
            <div className="text-xs text-slate-500">{d.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · order {d.paypalOrderId}</div>
          </div>
          {d.allocations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Waiting in the relief pool for the next verified claim.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {d.allocations.map((a) => (
                <li key={a.id}>
                  <span className="font-semibold">${Number(a.amountUsd).toFixed(2)}</span> → claim <code>{a.payout.claim.claimPublicId}</code>,{" "}
                  {a.payout.claim.disasterEventId ?? "event"} (cell {a.payout.claim.geoCell}), paid {a.payout.createdAt.toISOString().slice(11, 16)} UTC via
                  PayPal payout <code>{a.payout.payoutBatchId}</code>
                </li>
              ))}
            </ul>
          )}
          {Number(d.remainingUsd) > 0 && d.allocations.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">${Number(d.remainingUsd).toFixed(2)} still in the pool.</p>
          )}
        </div>
      ))}
    </div>
  );
}
