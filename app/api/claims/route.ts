import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { claimPublicId, geoCell, sha256Hex } from "@/lib/privacy";
import { errorResponse, json } from "@/lib/http";
import { verifyClaim } from "@/workflows/verify-claim";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const Fields = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  message: z.string().trim().min(10).max(2000),
  paypal_email: z.string().trim().toLowerCase().email().max(127),
});

/**
 * POST /api/claims (multipart/form-data): lat, lon, message, paypal_email, photo.
 * Phase 1 runs verification inline and returns the decision.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const fields = Fields.parse({
      lat: form.get("lat"),
      lon: form.get("lon"),
      message: form.get("message"),
      paypal_email: form.get("paypal_email"),
    });
    const photo = form.get("photo");
    if (!(photo instanceof File)) return json({ error: "photo_required" }, 400);
    if (!PHOTO_TYPES.includes(photo.type)) return json({ error: "photo_type", allowed: PHOTO_TYPES }, 400);
    if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) return json({ error: "photo_size", maxBytes: MAX_PHOTO_BYTES }, 400);
    const bytes = new Uint8Array(await photo.arrayBuffer());

    const salt = env().CLAIM_ID_SALT;
    const base = {
      paypalEmail: fields.paypal_email,
      lat: fields.lat,
      lon: fields.lon,
      geoCell: geoCell(fields.lat, fields.lon),
      photoSha256: sha256Hex(bytes),
      messageText: fields.message,
      status: "RECEIVED",
    };

    // Repeat claims from one account get a sequence suffix so they can be stored (and rejected).
    let seq = await db.claim.count({ where: { paypalEmail: fields.paypal_email } });
    let claim;
    for (let i = 0; ; i++) {
      try {
        claim = await db.claim.create({ data: { ...base, claimPublicId: claimPublicId(salt, fields.paypal_email, seq) } });
        break;
      } catch (e) {
        if (i < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          seq++;
          continue;
        }
        throw e;
      }
    }

    const r = await verifyClaim(claim.id, { bytes, mimeType: photo.type });
    const after = await db.claim.findUniqueOrThrow({ where: { id: claim.id }, select: { status: true } });
    return json(
      {
        claimPublicId: r.claimPublicId,
        status: after.status,
        outcome: r.decision.outcome,
        score: r.decision.score,
        reason: r.decision.reason,
        signals: r.signals,
        explanation: r.explanation,
        ai: r.ai,
        payout:
          r.payout?.kind === "SENT"
            ? { kind: "SENT", senderBatchId: r.payout.senderBatchId, payoutBatchId: r.payout.payoutBatchId, itemStatus: r.payout.result.itemStatus }
            : r.payout ?? null,
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
