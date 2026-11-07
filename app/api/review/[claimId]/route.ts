import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { reviewerPublicId } from "@/lib/privacy";
import { elasticConfigured } from "@/lib/search/client";
import { updateClaimStatus } from "@/lib/search/claims";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";
import { dispatchPayout } from "@/workflows/dispatch";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Reviewers can only approve or reject, with a REQUIRED reason. No amount, no recipient (hard rule 3).
 * Unknown keys are rejected. Every decision is recorded (and goes on-chain in Phase 3).
 */
const Body = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().min(5).max(300) }).strict();

/** POST /api/review/:claimId — approve/reject an IN_REVIEW claim. */
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
      await tx.decision.create({ data: { claimId, actor, outcome, score: claim.score, reason: `reviewer ${body.action}: ${body.reason}` } });
      await tx.claim.update({ where: { id: claimId }, data: { status: outcome } });
      return { outcome, claimPublicId: claim.claimPublicId };
    });
    if (!updated) return json({ error: "not_found" }, 404);
    if ("conflict" in updated) return json({ error: "not_in_review", status: updated.conflict }, 409);

    // Approved claims start vouching; rejected ones never do.
    if (elasticConfigured()) await updateClaimStatus(updated.claimPublicId, updated.outcome).catch(() => undefined);

    const d = updated.outcome === "APPROVED" ? await dispatchPayout(claimId) : null;
    const payout =
      d?.mode === "workflow"
        ? { kind: "QUEUED", taskRunId: d.taskRunId }
        : d?.payout.kind === "SENT"
          ? { kind: "SENT", senderBatchId: d.payout.senderBatchId, payoutBatchId: d.payout.payoutBatchId, itemStatus: d.payout.result.itemStatus }
          : (d?.payout ?? null);
    return json({ outcome: updated.outcome, actor, payout });
  } catch (err) {
    return errorResponse(err);
  }
}
