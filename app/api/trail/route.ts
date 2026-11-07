import { publicFeed } from "@/lib/public/feed";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/trail — the public transparency feed for /dashboard: pool totals, donations, claims (~10 km
 * cells), decisions, payouts with FIFO "funded by", and the Solana trail (memo + the exact row JSON that
 * was hashed, so anyone can re-hash it). Redacted by construction (lib/public/feed.ts).
 */
export async function GET() {
  try {
    return json(await publicFeed());
  } catch (err) {
    return errorResponse(err);
  }
}
