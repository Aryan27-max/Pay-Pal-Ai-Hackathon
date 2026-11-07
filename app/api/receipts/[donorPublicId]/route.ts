import { donorReceipt } from "@/lib/public/receipt";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/receipts/:donorPublicId — where each dollar of this (anonymous) donor went, with Solana links. */
export async function GET(_req: Request, ctx: { params: Promise<{ donorPublicId: string }> }) {
  try {
    const { donorPublicId } = await ctx.params;
    const r = await donorReceipt(donorPublicId);
    return r ? json(r) : json({ error: "not_found" }, 404);
  } catch (err) {
    return errorResponse(err);
  }
}
