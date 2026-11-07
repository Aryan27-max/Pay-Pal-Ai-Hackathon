import { z } from "zod";
import { paypalFetch } from "./client";

/**
 * Orders v2 — donations into the relief pool.
 * Field names confirmed against PayPal's OpenAPI spec (checkout_orders_v2.json v2.32)
 * and developer.paypal.com/docs/api/orders/v2. See .claude/skills/paypal-sandbox/SKILL.md.
 */

export const DonationAmountSchema = z.coerce.number().min(1).max(500).multipleOf(0.01);

const money = (usd: number) => usd.toFixed(2);

const CaptureSchema = z
  .object({
    id: z.string(),
    status: z.string(), // e.g. COMPLETED, PENDING, DECLINED (full enum: TODO confirm)
    amount: z.object({ currency_code: z.string(), value: z.string() }),
  })
  .passthrough();

export const OrderSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    payer: z.object({ email_address: z.string().optional(), payer_id: z.string().optional() }).passthrough().optional(),
    purchase_units: z
      .array(
        z
          .object({
            custom_id: z.string().optional(),
            payee: z.object({ email_address: z.string().optional(), merchant_id: z.string().optional() }).passthrough().optional(),
            payments: z.object({ captures: z.array(CaptureSchema).optional() }).passthrough().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type Order = z.infer<typeof OrderSchema>;

export type CapturedDonation = {
  orderId: string;
  captureId: string;
  captureStatus: string;
  amountUsd: number;
  currency: string;
  /** Used only to derive the anonymous donor id; never stored. */
  payerKey: string | null;
  streamId: string | null;
};

function purchaseUnit(streamId: string, amountUsd: number) {
  return {
    amount: { currency_code: "USD", value: money(amountUsd) },
    description: "Relief Stream donation to the relief pool",
    custom_id: streamId.slice(0, 127),
  };
}

/** Create an order for the JS SDK donate button. The buyer approves it in the PayPal popup. */
export async function createDonationOrder(input: { amountUsd: number; streamId: string; requestId: string }): Promise<Order> {
  const amount = DonationAmountSchema.parse(input.amountUsd);
  const raw = await paypalFetch({
    method: "POST",
    path: "/v2/checkout/orders",
    requestId: input.requestId,
    body: { intent: "CAPTURE", purchase_units: [purchaseUnit(input.streamId, amount)] },
  });
  return OrderSchema.parse(raw);
}

/** Capture an approved order. Idempotent via PayPal-Request-Id = capture-<orderId>. */
export async function captureOrder(orderId: string): Promise<Order> {
  if (!/^[A-Z0-9]{1,36}$/.test(orderId)) throw new Error("invalid order id");
  const raw = await paypalFetch({
    method: "POST",
    path: `/v2/checkout/orders/${orderId}/capture`,
    requestId: `capture-${orderId}`,
    body: {},
  });
  return OrderSchema.parse(raw);
}

export async function getOrder(orderId: string): Promise<Order> {
  if (!/^[A-Z0-9]{1,36}$/.test(orderId)) throw new Error("invalid order id");
  return OrderSchema.parse(await paypalFetch({ method: "GET", path: `/v2/checkout/orders/${orderId}` }));
}

/**
 * SIMULATOR ONLY: single-step card donation with a PayPal sandbox test card, so
 * scripted donors don't need a browser popup. PayPal-Request-Id is mandatory here.
 */
export async function createSandboxCardDonation(input: {
  amountUsd: number;
  streamId: string;
  requestId: string;
  cardholder: string;
}): Promise<Order> {
  if (!(process.env.PAYPAL_API_BASE ?? "").includes("sandbox")) throw new Error("card simulator is sandbox-only");
  const amount = DonationAmountSchema.parse(input.amountUsd);
  const raw = await paypalFetch({
    method: "POST",
    path: "/v2/checkout/orders",
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit(input.streamId, amount)],
      payment_source: {
        card: {
          // Official PayPal sandbox test Visa, listed in "Test card numbers" at
          // https://developer.paypal.com/tools/sandbox/card-testing/ (any future expiry, any 3-digit CVV).
          number: "4012000033330026",
          expiry: "2030-12",
          security_code: "123",
          name: input.cardholder,
          billing_address: { country_code: "US", postal_code: "95131" },
        },
      },
    },
  });
  return OrderSchema.parse(raw);
}

/** Pull the completed capture out of an order response. */
export function extractCapture(order: Order): CapturedDonation | null {
  for (const pu of order.purchase_units ?? []) {
    for (const c of pu.payments?.captures ?? []) {
      return {
        orderId: order.id,
        captureId: c.id,
        captureStatus: c.status,
        amountUsd: Number(c.amount.value),
        currency: c.amount.currency_code,
        payerKey: order.payer?.payer_id ?? order.payer?.email_address ?? null,
        streamId: pu.custom_id ?? null,
      };
    }
  }
  return null;
}
