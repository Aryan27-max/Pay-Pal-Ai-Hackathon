import { db } from "@/lib/db";
import { redactClaim } from "@/lib/privacy";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/claims/:publicId — public, redacted status. No email, no exact GPS, no message. */
export async function GET(_req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await ctx.params;
    if (!/^c_[0-9a-f]{20}$/.test(publicId)) return json({ error: "not_found" }, 404);
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
