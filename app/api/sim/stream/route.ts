import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { recordDonation } from "@/lib/ledger";
import { createSandboxCardDonation, DonationAmountSchema, extractCapture } from "@/lib/paypal/orders";
import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";
import { dispatchRelease } from "@/workflows/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  streamId: z.string().regex(/^[a-z0-9-]{1,40}$/).default("main"),
  donations: z.array(z.object({ name: z.string().min(1).max(40), amountUsd: DonationAmountSchema })).min(1).max(20),
});

/**
 * POST /api/sim/stream — DEMO ONLY. Scripted sandbox donations paid with a PayPal sandbox test card
 * (no popup). Requires the operator token. The real stream page uses the PayPal button.
 */
export async function POST(req: Request) {
  if (!reviewerToken(req)) return unauthorized();
  try {
    const body = Body.parse(await req.json());
    const results = [];
    for (const d of body.donations) {
      try {
        const order = await createSandboxCardDonation({ amountUsd: d.amountUsd, streamId: body.streamId, requestId: randomUUID(), cardholder: d.name });
        const cap = extractCapture(order);
        if (!cap) {
          results.push({ name: d.name, ok: false, orderId: order.id, error: `no capture (order ${order.status})` });
          continue;
        }
        // Simulated donors share one card, so key the anonymous donor id by name + capture.
        const r = await recordDonation({ ...cap, payerKey: `sim:${d.name}` }, "sim_card", env().CLAIM_ID_SALT);
        results.push({ name: d.name, ok: r.recorded, orderId: cap.orderId, captureId: cap.captureId, amountUsd: cap.amountUsd, donorPublicId: r.recorded ? r.donation.donorPublicId : null });
      } catch (e) {
        results.push({ name: d.name, ok: false, error: e instanceof Error ? e.message : "error" });
      }
    }
    // Inline: await here (demo route) so the caller sees which WAITING_FUNDS claims this wave released.
    // Render Workflows: the release runs as a task; the caller polls the claims instead.
    const d = await dispatchRelease({ waitMs: 30_000 });
    if (d.mode === "workflow") return json({ results, released: [], releaseTaskRunId: d.taskRunId });
    const released = d.released.map((r) => ({
      claimPublicId: r.claimPublicId,
      kind: r.result.kind,
      senderBatchId: r.result.kind === "SENT" ? r.result.senderBatchId : undefined,
      payoutBatchId: r.result.kind === "SENT" ? r.result.payoutBatchId : undefined,
      itemStatus: r.result.kind === "SENT" ? r.result.result.itemStatus : undefined,
      error: r.result.kind === "FAILED" ? r.result.error : undefined,
    }));
    return json({ results, released });
  } catch (err) {
    return errorResponse(err);
  }
}
