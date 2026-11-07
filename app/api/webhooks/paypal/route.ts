import { after } from "next/server";
import { retryWaitingFunds } from "@/workflows/send-payout";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { recordDonation, settlePayout } from "@/lib/ledger";
import { extractCapture, getOrder } from "@/lib/paypal/orders";
import { summarizeBatch, getPayoutBatch } from "@/lib/paypal/payouts";
import { payoutItemFromResource, verifyWebhookSignature, WebhookEventSchema } from "@/lib/paypal/webhooks";
import { errorResponse, json } from "@/lib/http";
import { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/paypal
 * 1. Verify signature when PAYPAL_WEBHOOK_ID is set (optional in Phase 1).
 * 2. De-duplicate by event id (WebhookEvent PK).
 * 3. Never trust the payload for money: re-fetch the order / payout batch from PayPal.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const event = WebhookEventSchema.parse(parsedJson);

    const webhookId = env().PAYPAL_WEBHOOK_ID;
    let verified = false;
    if (webhookId) {
      verified = await verifyWebhookSignature(req.headers, parsedJson, webhookId);
      if (!verified) return json({ error: "signature_verification_failed" }, 400);
    }

    try {
      await db.webhookEvent.create({ data: { eventId: event.id, eventType: event.event_type, payload: parsedJson as Prisma.InputJsonValue } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return json({ ok: true, duplicate: true });
      throw e;
    }

    const resource = event.resource ?? {};
    let handled = "ignored";

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const related = (resource["supplementary_data"] as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      const orderId = related?.order_id; // TODO: confirm path against a real sandbox event
      if (orderId) {
        const cap = extractCapture(await getOrder(orderId));
        if (cap) {
          const r = await recordDonation(cap, "paypal_button", env().CLAIM_ID_SALT);
          handled = r.recorded ? "donation_recorded" : `donation_skipped: ${r.reason}`;
          if (r.recorded) after(() => retryWaitingFunds().then(() => undefined, () => undefined));
        }
      }
    } else if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
      const item = payoutItemFromResource(resource);
      const payout = await db.payout.findFirst({
        where: { OR: [{ payoutItemId: item.payoutItemId ?? "-" }, { payoutBatchId: item.payoutBatchId ?? "-" }] },
      });
      if (payout?.payoutBatchId) {
        const r = summarizeBatch(await getPayoutBatch(payout.payoutBatchId));
        if (r.final) {
          await settlePayout(payout.id, r);
          handled = `payout_settled: ${r.itemStatus}`;
        } else handled = "payout_not_final";
      }
    }

    return json({ ok: true, verified, handled });
  } catch (err) {
    return errorResponse(err);
  }
}
