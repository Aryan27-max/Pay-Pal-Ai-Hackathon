import { db } from "@/lib/db";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/review — IN_REVIEW queue for reviewers (token required). Shows what a reviewer needs, no email. */
export async function GET(req: Request) {
  if (!reviewerToken(req)) return unauthorized();
  try {
    const claims = await db.claim.findMany({ where: { status: "IN_REVIEW" }, orderBy: { createdAt: "asc" } });
    return json({
      claims: claims.map((c) => ({
        id: c.id,
        claimPublicId: c.claimPublicId,
        geoCell: c.geoCell,
        score: c.score,
        signals: c.signals,
        aiExplanation: c.aiExplanation,
        messageText: c.messageText,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
