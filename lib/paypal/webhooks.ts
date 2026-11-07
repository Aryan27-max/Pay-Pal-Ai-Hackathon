import { z } from "zod";
import { paypalFetch } from "./client";

/**
 * Webhook signature verification via POST /v1/notifications/verify-webhook-signature
 * (notifications_webhooks_v1.json v1.11). See .claude/skills/paypal-sandbox/SKILL.md.
 */

export const HANDLED_EVENTS = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
] as const;

export const WebhookEventSchema = z
  .object({
    id: z.string().min(1),
    event_type: z.string().min(1),
    resource: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/** Header → request field mapping, per the spec. */
export function signatureFieldsFromHeaders(h: Headers) {
  return {
    auth_algo: h.get("paypal-auth-algo"),
    cert_url: h.get("paypal-cert-url"),
    transmission_id: h.get("paypal-transmission-id"),
    transmission_sig: h.get("paypal-transmission-sig"),
    transmission_time: h.get("paypal-transmission-time"),
  };
}

export async function verifyWebhookSignature(headers: Headers, event: unknown, webhookId: string): Promise<boolean> {
  const f = signatureFieldsFromHeaders(headers);
  if (Object.values(f).some((v) => !v)) return false;
  const res = await paypalFetch<{ verification_status?: string }>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: { ...f, webhook_id: webhookId, webhook_event: event },
  });
  return res.verification_status === "SUCCESS";
}

/**
 * Payout item resource layout is TODO: confirm against a real sandbox event.
 * We read defensively: payout_item_id, payout_batch_id and transaction_status.
 */
export function payoutItemFromResource(resource: Record<string, unknown> | undefined) {
  const r = resource ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    payoutItemId: str(r["payout_item_id"]),
    payoutBatchId: str(r["payout_batch_id"]),
    transactionStatus: str(r["transaction_status"]),
  };
}
