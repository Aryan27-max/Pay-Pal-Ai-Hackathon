import { z } from "zod";
import { paypalFetch } from "./client";

/**
 * Payouts v1 — relief packets from the pool straight to the claimant.
 * Only workflows/send-payout.ts may call this, and only after lib/scoring approved the claim.
 * Field names confirmed against payments_payouts_batch_v1.json (v1.9).
 * See .claude/skills/paypal-payouts/SKILL.md.
 */

export const BATCH_STATUSES = ["DENIED", "PENDING", "PROCESSING", "SUCCESS", "CANCELED"] as const;
export const ITEM_STATUSES = ["SUCCESS", "FAILED", "PENDING", "UNCLAIMED", "RETURNED", "ONHOLD", "BLOCKED", "REFUNDED", "REVERSED"] as const;

/** Item states we treat as settled for this run (no more polling). */
export const FINAL_ITEM_STATUSES = new Set(["SUCCESS", "FAILED", "UNCLAIMED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED"]);
export const FINAL_BATCH_STATUSES = new Set(["SUCCESS", "DENIED", "CANCELED"]);

/**
 * sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>  (max 256 chars per spec).
 * Deterministic per claim record + attempt, so re-sending the same attempt is idempotent.
 * The row tag (first 8 hex of the claim's DB uuid) matters because claim_public_id is derived
 * from the email: after a demo reset a NEW claim from the same claimant would otherwise reuse an
 * old id, and PayPal rejects a used sender_batch_id for 30 days (400 USER_BUSINESS_ERROR).
 */
export function senderBatchId(claimPublicId: string, claimRowId: string, attempt: number): string {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be >= 1");
  const tag = claimRowId.replace(/-/g, "").slice(0, 8).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(tag)) throw new Error("claim row id must be a uuid");
  const id = `${claimPublicId}-${tag}-${attempt}`;
  if (id.length > 256) throw new Error("sender_batch_id too long");
  return id;
}

const CreateResponseSchema = z
  .object({
    batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }).passthrough(),
  })
  .passthrough();

const ItemSchema = z
  .object({
    payout_item_id: z.string(),
    transaction_status: z.string().optional(),
    transaction_id: z.string().optional(),
    errors: z.object({ name: z.string(), message: z.string() }).passthrough().optional(),
  })
  .passthrough();

const BatchSchema = z
  .object({
    batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }).passthrough(),
    items: z.array(ItemSchema).optional(),
  })
  .passthrough();

export type PayoutBatch = z.infer<typeof BatchSchema>;

export async function createPayout(input: {
  senderBatchId: string;
  receiverEmail: string;
  amountCents: number;
  claimPublicId: string;
}): Promise<{ payoutBatchId: string; batchStatus: string }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("amountCents must be a positive integer");
  const raw = await paypalFetch({
    method: "POST",
    path: "/v1/payments/payouts",
    requestId: input.senderBatchId, // idempotency on our side as well as sender_batch_id on PayPal's
    body: {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        recipient_type: "EMAIL",
        email_subject: "You received a Relief Stream relief packet",
        email_message: "Donors on a charity stream funded this packet directly. No middleman held the money.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiverEmail,
          amount: { value: (input.amountCents / 100).toFixed(2), currency: "USD" },
          note: `Relief packet for verified claim ${input.claimPublicId}`,
          sender_item_id: input.claimPublicId.slice(0, 63),
        },
      ],
    },
  });
  const r = CreateResponseSchema.parse(raw);
  return { payoutBatchId: r.batch_header.payout_batch_id, batchStatus: r.batch_header.batch_status };
}

export async function getPayoutBatch(payoutBatchId: string): Promise<PayoutBatch> {
  if (!/^[A-Za-z0-9]{1,30}$/.test(payoutBatchId)) throw new Error("invalid payout_batch_id");
  return BatchSchema.parse(await paypalFetch({ method: "GET", path: `/v1/payments/payouts/${payoutBatchId}` }));
}

export type PayoutResult = {
  batchStatus: string;
  itemStatus: string | null;
  payoutItemId: string | null;
  error: string | null;
  final: boolean;
};

export function summarizeBatch(b: PayoutBatch): PayoutResult {
  const item = b.items?.[0];
  const itemStatus = item?.transaction_status ?? null;
  const batchStatus = b.batch_header.batch_status;
  const final = (itemStatus !== null && FINAL_ITEM_STATUSES.has(itemStatus)) || batchStatus === "DENIED" || batchStatus === "CANCELED";
  return {
    batchStatus,
    itemStatus,
    payoutItemId: item?.payout_item_id ?? null,
    error: item?.errors ? `${item.errors.name}: ${item.errors.message}` : null,
    final,
  };
}

/** Poll until the item is final or the timeout passes. */
export async function waitForPayout(
  payoutBatchId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<PayoutResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  const interval = opts.intervalMs ?? 3_000;
  // Always poll at least once, so a tiny timeout (used by syncPendingPayouts) still reads the live status.
  for (;;) {
    const last = summarizeBatch(await getPayoutBatch(payoutBatchId));
    if (last.final || Date.now() + interval >= deadline) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
}
