import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { reviewerPublicId } from "@/lib/privacy";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";
import { sendPayout } from "@/workflows/send-payout";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Reviewers can only approve or reject. No amount, no recipient (hard rule 3). Unknown keys are rejected. */
const Body = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(300).optional() }).strict();

/** POST /api/review/:claimId — approve/reject an IN_REVIEW claim. Every decision is recorded. */
export async function POST(req: Request, ctx: { params: Promise<{ claimId: string }> }) {
  const token = reviewerToken(req);
  if (!token) return unauthorized();
  try {
    const { claimId } = await ctx.params;
    if (!z.string().uuid().safeParse(claimId).success) return json({ error: "not_found" }, 404);
    const body = Body.parse(await req.json());
    const actor = reviewerPublicId(env().CLAIM_ID_SALT, token);

    const updated = await db.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id: claimId } });
      if (!claim) return null;
      if (claim.status !== "IN_REVIEW") return { conflict: claim.status };
      const outcome = body.action === "approve" ? "APPROVED" : "REJECTED";
      await tx.decision.create({
        data: { claimId, actor, outcome, score: claim.score, reason: `reviewer ${body.action}${body.note ? `: ${body.note}` : ""}` },
      });
      await tx.claim.update({ where: { id: claimId }, data: { status: outcome } });
      return { outcome };
    });
    if (!updated) return json({ error: "not_found" }, 404);
    if ("conflict" in updated) return json({ error: "not_in_review", status: updated.conflict }, 409);

    const payout = updated.outcome === "APPROVED" ? await sendPayout(claimId) : null;
    return json({
      outcome: updated.outcome,
      actor,
      payout: payout?.kind === "SENT" ? { kind: "SENT", senderBatchId: payout.senderBatchId, payoutBatchId: payout.payoutBatchId, itemStatus: payout.result.itemStatus } : payout,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
