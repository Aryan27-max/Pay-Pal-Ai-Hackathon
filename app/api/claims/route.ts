import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { claimPublicId, geoCell, sha256Hex } from "@/lib/privacy";
import { claimReport } from "@/lib/claims/report";
import { keepLocal } from "@/lib/claims/evidence";
import { AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/speech";
import { errorResponse, json } from "@/lib/http";
import { dispatchVerify, workflowsEnabled } from "@/workflows/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const Fields = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  message: z.string().trim().max(2000).default(""),
  paypal_email: z.string().trim().toLowerCase().email().max(127),
});

/**
 * POST /api/claims (multipart/form-data): lat, lon, paypal_email, photo, and message and/or audio
 * (a voice note; at least one of the two). Photo and audio bytes go to claim_evidence and are deleted
 * as soon as the decision is made.
 *  - Render Workflows on (RENDER_WORKFLOW_SERVICE_ID set): 202 + task run id; poll GET /api/claims/:publicId?detail=1
 *  - otherwise: verification runs inline and the full report comes back (201)
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const fields = Fields.parse({
      lat: form.get("lat"),
      lon: form.get("lon"),
      message: form.get("message") ?? undefined,
      paypal_email: form.get("paypal_email"),
    });
    const photo = form.get("photo");
    if (!(photo instanceof File)) return json({ error: "photo_required" }, 400);
    if (!PHOTO_TYPES.includes(photo.type)) return json({ error: "photo_type", allowed: PHOTO_TYPES }, 400);
    if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) return json({ error: "photo_size", maxBytes: MAX_PHOTO_BYTES }, 400);
    const photoBytes = new Uint8Array(await photo.arrayBuffer());

    const audio = form.get("audio");
    let audioBytes: Uint8Array | null = null;
    if (audio instanceof File && audio.size > 0) {
      if (!AUDIO_TYPES.includes(audio.type)) return json({ error: "audio_type", allowed: AUDIO_TYPES }, 400);
      if (audio.size > MAX_AUDIO_BYTES) return json({ error: "audio_size", maxBytes: MAX_AUDIO_BYTES }, 400);
      audioBytes = new Uint8Array(await audio.arrayBuffer());
    }
    if (!audioBytes && fields.message.length < 10) return json({ error: "message_or_voice_required", detail: "send a message of 10+ characters or a voice note" }, 400);

    const salt = env().CLAIM_ID_SALT;
    const base = {
      paypalEmail: fields.paypal_email,
      lat: fields.lat,
      lon: fields.lon,
      geoCell: geoCell(fields.lat, fields.lon),
      photoSha256: sha256Hex(photoBytes),
      audioSha256: audioBytes ? sha256Hex(audioBytes) : null,
      messageText: fields.message,
      status: "RECEIVED",
    };

    // Repeat claims from one account get a sequence suffix so they can be stored (and rejected).
    let seq = await db.claim.count({ where: { paypalEmail: fields.paypal_email } });
    const audioMime = audioBytes && audio instanceof File ? audio.type : null;
    // Render Workflows: evidence goes to Postgres for the task instances. Inline: memory only (lib/claims/evidence).
    const toDb = workflowsEnabled();
    let claim;
    for (let i = 0; ; i++) {
      try {
        claim = await db.claim.create({
          data: {
            ...base,
            claimPublicId: claimPublicId(salt, fields.paypal_email, seq),
            ...(toDb
              ? { evidence: { create: { photo: Buffer.from(photoBytes), photoMime: photo.type, ...(audioBytes && audioMime ? { audio: Buffer.from(audioBytes), audioMime } : {}) } } }
              : {}),
          },
        });
        break;
      } catch (e) {
        if (i < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          seq++;
          continue;
        }
        throw e;
      }
    }

    if (!toDb) keepLocal(claim.id, { photo: photoBytes, photoMime: photo.type, audio: audioBytes, audioMime });
    const d = await dispatchVerify(claim.id);
    if (d.mode === "workflow") {
      return json({ claimPublicId: claim.claimPublicId, status: "RECEIVED", mode: "workflow", taskRunId: d.taskRunId, poll: `/api/claims/${claim.claimPublicId}?detail=1` }, 202);
    }
    const report = await claimReport({ id: claim.id });
    return json(
      {
        ...report,
        mode: "inline",
        payoutResult:
          d.payout?.kind === "SENT"
            ? { kind: "SENT", senderBatchId: d.payout.senderBatchId, payoutBatchId: d.payout.payoutBatchId, itemStatus: d.payout.result.itemStatus }
            : (d.payout ?? null),
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
