import { errorResponse, json, reviewerToken, unauthorized } from "@/lib/http";
import { syncPendingPayouts } from "@/workflows/send-payout";

export const runtime = "nodejs";

/** POST /api/payouts/sync — re-poll PENDING payouts and settle final ones (operator token). */
export async function POST(req: Request) {
  if (!reviewerToken(req)) return unauthorized();
  try {
    return json(await syncPendingPayouts());
  } catch (err) {
    return errorResponse(err);
  }
}
