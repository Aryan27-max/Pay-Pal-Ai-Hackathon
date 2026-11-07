import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assessClaim } from "@/lib/ai";
import { demoCacheEnabled, isFixtureClaim, messageSha256 } from "@/lib/ai/demo-cache";
import { checkLocation, DEMO_ZONE, disasterContext } from "@/lib/disasters";
import { VERIFIED_CLAIM_STATUSES } from "@/lib/ledger";
import { haversineKm } from "@/lib/privacy";
import {
  decide,
  messageSignal,
  photoSignal,
  scoringConfigFrom,
  uniquenessSignal,
  vouchingSignal,
  type Decision,
  type Signals,
} from "@/lib/scoring";
import { sendPayout, type SendPayoutResult } from "./send-payout";

/**
 * verify_claim(claim_id). Phase 1: runs inline from POST /api/claims.
 * Phase 2: a Render Workflows task with the five checks as retryable steps.
 *
 * The AI supplies photo/message inputs; lib/scoring decides. Only an APPROVED
 * decision from lib/scoring reaches send-payout.
 */
export const VOUCH_RADIUS_KM = 10;

export type VerifyResult = {
  claimId: string;
  claimPublicId: string;
  decision: Decision;
  signals: Signals;
  explanation: string;
  ai: {
    provider: string | null;
    model: string | null;
    cached: boolean;
    calls: { gemini: number; groq: number };
    /** Raw AI sub-scores (no PII), so the demo can show what the model said. */
    scores: { photo_matches_disaster: number; photo_ai_generated_risk: number; message_consistency: number } | null;
  };
  payout?: SendPayoutResult;
};

export async function verifyClaim(claimId: string, photo: { bytes: Uint8Array; mimeType: string }): Promise<VerifyResult> {
  const cfg = scoringConfigFrom(env());
  const claim = await db.claim.update({ where: { id: claimId }, data: { status: "VERIFYING" } });

  // Location (fixed demo zone in Phase 1)
  const loc = checkLocation(claim.lat, claim.lon);

  // Uniqueness: same PayPal account or same photo bytes on any other claim
  const [sameEmail, samePhoto] = await Promise.all([
    db.claim.count({ where: { id: { not: claimId }, paypalEmail: claim.paypalEmail } }),
    db.claim.count({ where: { id: { not: claimId }, photoSha256: claim.photoSha256 } }),
  ]);
  const uniqueness = uniquenessSignal({ sameEmail: sameEmail > 0, samePhoto: samePhoto > 0 });

  // Vouching: verified claims within 10 km (bounding box in SQL, exact distance in code)
  const dLat = VOUCH_RADIUS_KM / 111;
  const dLon = VOUCH_RADIUS_KM / (111 * Math.max(0.1, Math.cos((claim.lat * Math.PI) / 180)));
  const candidates = await db.claim.findMany({
    where: {
      id: { not: claimId },
      status: { in: VERIFIED_CLAIM_STATUSES },
      lat: { gte: claim.lat - dLat, lte: claim.lat + dLat },
      lon: { gte: claim.lon - dLon, lte: claim.lon + dLon },
    },
    select: { lat: true, lon: true },
  });
  const nearbyVerified = candidates.filter((c) => haversineKm(c, claim) <= VOUCH_RADIUS_KM).length;

  // AI: one call assesses photo + message together (skipped for duplicates: the hard rule rejects
  // them whatever the AI says). The demo cache is only for simulator fixture claims, matched on
  // content hashes here on the server; every other claim always calls the AI.
  let ai: Awaited<ReturnType<typeof assessClaim>> | null = null;
  if (uniqueness === 1) {
    const useCache = demoCacheEnabled() && isFixtureClaim(claim.photoSha256, messageSha256(claim.messageText));
    ai = await assessClaim({ photo, messageText: claim.messageText, disaster: disasterContext(DEMO_ZONE) }, { useCache });
  }
  const aiValid = ai === null || ai.ok;
  const assessment = ai?.ok ? ai.assessment : null;
  const aiMeta = ai?.ok ? { provider: ai.provider, model: ai.model, cached: ai.cached } : null;

  const signals: Signals = {
    photo: assessment ? photoSignal(assessment) : 0,
    location: loc.signal,
    message: assessment ? messageSignal(assessment) : 0,
    uniqueness,
    vouching: vouchingSignal(nearbyVerified),
  };
  const decision = decide(signals, cfg, { aiValid, aiFailure: ai && !ai.ok ? ai.error : undefined });

  const explanation =
    uniqueness === 0
      ? `Duplicate: ${sameEmail > 0 ? "this PayPal account already has a claim" : ""}${sameEmail > 0 && samePhoto > 0 ? "; " : ""}${samePhoto > 0 ? "this exact photo was already submitted" : ""}. AI check skipped; hard rule rejects.`
      : assessment?.explanation ?? `AI check failed on both providers (${ai && !ai.ok ? ai.error : "unknown"}). Sent to human review.`;

  const status = decision.outcome; // APPROVED | IN_REVIEW | REJECTED
  await db.$transaction([
    db.claim.update({
      where: { id: claimId },
      data: {
        status,
        score: decision.score,
        disasterEventId: loc.eventId,
        aiExplanation: explanation.slice(0, 1500),
        aiProvider: aiMeta?.provider ?? null,
        aiModel: aiMeta?.model ?? null,
        aiCached: aiMeta?.cached ?? false,
        signals: {
          ...signals,
          detail: {
            distanceKm: Math.round(loc.distanceKm * 10) / 10,
            insideEvent: loc.inside,
            duplicateEmail: sameEmail > 0,
            duplicatePhoto: samePhoto > 0,
            nearbyVerified,
            ai: assessment
              ? {
                  provider: aiMeta?.provider,
                  model: aiMeta?.model,
                  cached: aiMeta?.cached,
                  calls: ai?.calls,
                  photo_matches_disaster: assessment.photo_matches_disaster,
                  photo_ai_generated_risk: assessment.photo_ai_generated_risk,
                  message_consistency: assessment.message_consistency,
                  language_detected: assessment.language_detected,
                  red_flags: assessment.red_flags,
                }
              : { skipped: uniqueness === 0, valid: aiValid, calls: ai?.calls ?? { gemini: 0, groq: 0 } },
          },
        },
      },
    }),
    db.decision.create({ data: { claimId, actor: "engine", outcome: decision.outcome, score: decision.score, reason: decision.reason } }),
  ]);

  const result: VerifyResult = {
    claimId,
    claimPublicId: claim.claimPublicId,
    decision,
    signals,
    explanation,
    ai: { provider: aiMeta?.provider ?? null, model: aiMeta?.model ?? null, cached: aiMeta?.cached ?? false,
      calls: ai?.calls ?? { gemini: 0, groq: 0 },
      scores: assessment
        ? { photo_matches_disaster: assessment.photo_matches_disaster, photo_ai_generated_risk: assessment.photo_ai_generated_risk, message_consistency: assessment.message_consistency }
        : null,
    },
  };
  if (decision.outcome === "APPROVED") result.payout = await sendPayout(claimId);
  return result;
}
