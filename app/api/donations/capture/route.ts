import { after } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { recordDonation, usd } from "@/lib/ledger";
import { captureOrder, extractCapture } from "@/lib/paypal/orders";
import { errorResponse, json } from "@/lib/http";
import { dispatchRelease } from "@/workflows/dispatch";

export const runtime = "nodejs";

const Body = z.object({ orderId: z.string().regex(/^[A-Z0-9]{1,36}$/) });

/** POST /api/donations/capture → captures the approved order and saves the donation (no webhook needed). */
export async function POST(req: Request) {
  try {
    const { orderId } = Body.parse(await req.json());
    const order = await captureOrder(orderId);
    const cap = extractCapture(order);
    if (!cap) return json({ error: "no_capture_in_response", orderStatus: order.status }, 502);
    const saved = await recordDonation(cap, "paypal_button", env().CLAIM_ID_SALT);
    // Pay WAITING_FUNDS claims (oldest first) once this donation lands; runs after the response is sent.
    if (saved.recorded) after(() => dispatchRelease().then(() => undefined, () => undefined));
    return json({
      orderId: cap.orderId,
      captureId: cap.captureId,
      captureStatus: cap.captureStatus,
      amountUsd: usd(Math.round(cap.amountUsd * 100)),
      recorded: saved.recorded,
      donorPublicId: saved.recorded ? saved.donation.donorPublicId : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
