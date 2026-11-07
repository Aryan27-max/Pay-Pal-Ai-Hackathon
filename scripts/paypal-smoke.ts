/**
 * npm run paypal:smoke — creates a $1 button order (not captured) and a $1 sandbox card order,
 * and checks that donations land in PAYPAL_POOL_BUSINESS_EMAIL. Prints IDs and booleans only.
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { createDonationOrder, createSandboxCardDonation, extractCapture } from "../lib/paypal/orders";

async function main() {
  const pool = (process.env.PAYPAL_POOL_BUSINESS_EMAIL ?? "").toLowerCase();
  const o = await createDonationOrder({ amountUsd: 1, streamId: "smoke", requestId: randomUUID() });
  const payee = o.purchase_units?.[0]?.payee?.email_address?.toLowerCase();
  console.log("button order:", o.id, o.status, "| payee == PAYPAL_POOL_BUSINESS_EMAIL:", payee === pool);
  try {
    const c = await createSandboxCardDonation({ amountUsd: 1, streamId: "smoke", requestId: randomUUID(), cardholder: "Smoke Donor" });
    const cap = extractCapture(c);
    console.log("card order:", c.id, c.status, "| capture:", cap?.captureId, cap?.captureStatus, cap?.amountUsd);
  } catch (e) {
    console.log("card order FAILED:", (e as Error).message, JSON.stringify((e as { details?: unknown }).details ?? null));
  }
}
main().catch((e) => {
  console.error("smoke failed:", (e as Error).message);
  process.exit(1);
});
