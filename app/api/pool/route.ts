import { db } from "@/lib/db";
import { poolSummary, usd } from "@/lib/ledger";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/pool — public pool totals + recent anonymous donations for the stream page. */
export async function GET() {
  try {
    const [s, recent] = await Promise.all([
      poolSummary(),
      db.donation.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { donorPublicId: true, amountUsd: true, createdAt: true } }),
    ]);
    return json({
      donatedUsd: usd(s.donatedCents),
      paidOutUsd: usd(s.paidOutCents),
      availableUsd: usd(s.availableCents),
      donations: s.donations,
      recent: recent.map((d) => ({ donor: d.donorPublicId, amountUsd: Number(d.amountUsd).toFixed(2), at: d.createdAt.toISOString() })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
