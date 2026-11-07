import { db } from "@/lib/db";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/review — IN_REVIEW queue for reviewers (token required). Shows what a reviewer needs to judge
 * the evidence: every signal with its details, the AI's red flags and explanation, the engine's reason,
 * the message and the voice transcript. Never the email or exact GPS.
 */
export async function GET(req: Request) {
  if (!reviewerToken(req)) return unauthorized();
  try {
    const claims = await db.claim.findMany({
      where: { status: "IN_REVIEW" },
      orderBy: { createdAt: "asc" },
      include: { decisions: { where: { actor: "engine" }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    return json({
      claims: claims.map((c) => ({
        id: c.id,
        claimPublicId: c.claimPublicId,
        geoCell: c.geoCell,
        score: c.score,
        signals: c.signals,
        engineReason: c.decisions[0]?.reason ?? null,
        aiExplanation: c.aiExplanation,
        aiProvider: c.aiProvider,
        messageText: c.messageText,
        transcript: c.transcript,
        transcriptLang: c.transcriptLang,
        eventSource: c.eventSource,
        disasterEventId: c.disasterEventId,
        kernelStatus: c.kernelStatus,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
