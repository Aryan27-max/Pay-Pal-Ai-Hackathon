import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDonationOrder, DonationAmountSchema } from "@/lib/paypal/orders";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  amountUsd: DonationAmountSchema,
  streamId: z.string().regex(/^[a-z0-9-]{1,40}$/).default("main"),
});

/** POST /api/donations/create-order → { id } for the PayPal JS SDK button. */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const order = await createDonationOrder({ amountUsd: body.amountUsd, streamId: body.streamId, requestId: randomUUID() });
    return json({ id: order.id, status: order.status });
  } catch (err) {
    return errorResponse(err);
  }
}
