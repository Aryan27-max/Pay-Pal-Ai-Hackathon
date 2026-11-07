import { db } from "@/lib/db";
import { redactClaim } from "@/lib/privacy";
import { claimReport } from "@/lib/claims/report";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/claims/:publicId — public, redacted status. No email, no exact GPS, no message.
 * GET /api/claims/:publicId?detail=1 — operator/reviewer report (signals, evidence details, decision,
 * payout ids). Requires the reviewer token. Still no email, GPS, message, transcript or replay URL.
 */
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await ctx.params;
    if (!/^c_[0-9a-f]{20}$/.test(publicId)) return json({ error: "not_found" }, 404);
    if (new URL(req.url).searchParams.get("detail") === "1") {
      if (!reviewerToken(req)) return unauthorized();
      const report = await claimReport({ claimPublicId: publicId });
      return report ? json(report) : json({ error: "not_found" }, 404);
    }
    const c = await db.claim.findUnique({
      where: { claimPublicId: publicId },
      include: {
        decisions: { orderBy: { createdAt: "asc" }, select: { actor: true, outcome: true, score: true, reason: true, createdAt: true } },
        payouts: { orderBy: { attempt: "asc" }, select: { attempt: true, amountUsd: true, status: true, payoutBatchId: true, createdAt: true } },
      },
    });
    if (!c) return json({ error: "not_found" }, 404);
    return json({
      claim: redactClaim(c),
      decisions: c.decisions.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      payouts: c.payouts.map((p) => ({ ...p, amountUsd: Number(p.amountUsd).toFixed(2), createdAt: p.createdAt.toISOString() })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
