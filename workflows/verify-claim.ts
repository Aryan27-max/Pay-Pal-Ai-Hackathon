import { db } from "@/lib/db";
import { dropEvidence, getEvidence } from "@/lib/claims/evidence";
import { env } from "@/lib/env";
import { assessClaim } from "@/lib/ai";
import { demoCacheEnabled, isFixtureClaim, messageSha256 } from "@/lib/ai/demo-cache";
import { hourKey, sendOpsAlert, sendReviewAlert } from "@/lib/alerts";
import { haversineKm } from "@/lib/privacy";
import { elasticConfigured } from "@/lib/search/client";
import { upsertClaimDoc } from "@/lib/search/claims";
import {
  decide,
  duplicateReason,
  exifFactor,
  messageSignal,
  photoSignal,
  scoringConfigFrom,
  uniquenessSignal,
  vouchingSignal,
  type Decision,
  type Signals,
} from "@/lib/scoring";
import {
  checkLocationStep,
  checkMessageStep,
  checkPhotoStep,
  checkUniquenessStep,
  checkVouchingStep,
  type CheckResults,
} from "./checks";

/**
 * verify_claim(claim_id): five independent checks in parallel (workflows/checks.ts), then finalizeClaim:
 * ONE AI call (photo + typed message + voice transcript), then the deterministic decision in lib/scoring.
 * On Render the checks are Workflows tasks (workflows/render.ts); locally they run with Promise.all.
 * Idempotent: a claim that already has a decision is returned as is.
 * Only an APPROVED decision from lib/scoring (or a reviewer) ever reaches send-payout.
 */
export type CheckRunner = {
  location: (id: string) => Promise<CheckResults["location"]>;
  photo: (id: string) => Promise<CheckResults["photo"]>;
  message: (id: string) => Promise<CheckResults["message"]>;
  uniqueness: (id: string) => Promise<CheckResults["uniqueness"]>;
  vouching: (id: string) => Promise<CheckResults["vouching"]>;
};

export const inlineRunner: CheckRunner = {
  location: checkLocationStep,
  photo: checkPhotoStep,
  message: checkMessageStep,
  uniqueness: checkUniquenessStep,
  vouching: checkVouchingStep,
};

export type Timings = Record<string, number>;

async function timed<T>(timings: Timings, name: string, f: () => Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    return await f();
  } finally {
    timings[name] = Date.now() - t;
  }
}

export async function runChecks(claimId: string, run: CheckRunner): Promise<CheckResults & { timings: Timings }> {
  const timings: Timings = {};
  const [location, photo, message, uniqueness, vouching] = await Promise.all([
    timed(timings, "location", () => run.location(claimId)),
    timed(timings, "photo", () => run.photo(claimId)),
    timed(timings, "message", () => run.message(claimId)),
    timed(timings, "uniqueness", () => run.uniqueness(claimId)),
    timed(timings, "vouching", () => run.vouching(claimId)),
  ]);
  return { location, photo, message, uniqueness, vouching, timings };
}

export type AiSummary = {
  provider: string | null;
  model: string | null;
  cached: boolean;
  calls: { gemini: number; groq: number };
  scores: { photo_matches_disaster: number; photo_ai_generated_risk: number; message_consistency: number } | null;
  redFlags: string[];
};

export type FinalizeResult = { claimId: string; claimPublicId: string; decision: Decision; signals: Signals; explanation: string; ai: AiSummary; alreadyDecided: boolean };

const DECIDED = ["APPROVED", "IN_REVIEW", "REJECTED", "WAITING_FUNDS", "PAYOUT_PENDING", "PAID", "PAYOUT_FAILED", "ON_CHAIN"];

/** Mark VERIFYING (only from RECEIVED/VERIFYING). Returns false if the claim was already decided. */
export async function beginVerification(claimId: string): Promise<boolean> {
  const r = await db.claim.updateMany({ where: { id: claimId, status: { in: ["RECEIVED", "VERIFYING"] } }, data: { status: "VERIFYING" } });
  return r.count === 1;
}

export async function finalizeClaim(claimId: string, checks: CheckResults & { timings?: Timings }): Promise<FinalizeResult> {
  const tFinal = Date.now();
  const cfg = scoringConfigFrom(env());
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId } });
  if (DECIDED.includes(claim.status)) return storedResult(claimId);
  const { location, photo, message, uniqueness: uq, vouching } = checks;

  const dup = { sameEmail: uq.sameEmail, samePhoto: uq.samePhoto, nearDuplicatePhoto: photo.nearDuplicate, nearCosine: photo.nearest?.cosine ?? null, nearDhash: photo.nearest?.dhash ?? null, nearRule: photo.rule };
  const uniqueness = uniquenessSignal(dup);

  // One AI call, skipped when a hard rule already decides (duplicate, or far from every event).
  let ai: Awaited<ReturnType<typeof assessClaim>> | null = null;
  const evidence = uniqueness === 1 && !location.far ? await getEvidence(claimId, "photo") : null;
  if (evidence) {
    const useCache = demoCacheEnabled() && isFixtureClaim(claim.photoSha256, messageSha256(claim.messageText), claim.audioSha256);
    ai = await assessClaim(
      {
        photo: { bytes: evidence.photo, mimeType: evidence.photoMime },
        messageText: claim.messageText,
        voice: claim.transcript ? { text: claim.transcript, language: claim.transcriptLang ?? "und" } : null,
        disaster: location.context,
      },
      { useCache },
    );
  }
  const aiValid = ai === null || ai.ok;
  const assessment = ai?.ok ? ai.assessment : null;

  const exif = exifFactor(
    { present: photo.exif.present, takenAt: photo.exif.takenAt ? new Date(photo.exif.takenAt) : undefined, gps: photo.exif.gps },
    { eventStart: new Date(location.eventStart ?? claim.createdAt.toISOString()), now: new Date(), claimPoint: { lat: claim.lat, lon: claim.lon }, distanceKm: haversineKm },
  );

  const signals: Signals = {
    photo: assessment ? photoSignal(assessment, exif.factor) : 0,
    location: location.signal,
    message: assessment ? messageSignal(assessment) : 0,
    uniqueness,
    vouching: vouchingSignal(vouching.nearbyVerified),
  };
  const decision = decide(signals, cfg, {
    aiValid,
    aiFailure: ai && !ai.ok ? ai.error : undefined,
    duplicate: duplicateReason(dup),
    farFromEvent: uniqueness === 1 && location.far ? { nearestKm: location.distanceOutsideKm } : null,
    photoCheckUnavailable: photo.unavailable,
    aiGeneratedRisk: assessment?.photo_ai_generated_risk,
  });

  const explanation =
    uniqueness === 0
      ? `Duplicate: ${duplicateReason(dup)}. AI check skipped; hard rule rejects.`
      : location.far
        ? `Location: not within reach of any active disaster event${location.distanceOutsideKm !== null ? ` (nearest event area ${Math.round(location.distanceOutsideKm)} km away)` : ""}. AI check skipped; hard rule rejects (appealable).`
        : (assessment?.explanation ?? `AI check failed on both providers (${ai && !ai.ok ? ai.error : "unknown"}). Sent to human review.`);

  const aiSummary: AiSummary = {
    provider: ai?.ok ? ai.provider : null,
    model: ai?.ok ? ai.model : null,
    cached: ai?.ok ? ai.cached : false,
    calls: ai?.calls ?? { gemini: 0, groq: 0 },
    scores: assessment
      ? { photo_matches_disaster: assessment.photo_matches_disaster, photo_ai_generated_risk: assessment.photo_ai_generated_risk, message_consistency: assessment.message_consistency }
      : null,
    redFlags: assessment?.red_flags ?? [],
  };

  const detail = {
    location: {
      eventId: location.eventId,
      eventSource: location.eventSource,
      eventName: location.context.name,
      distanceOutsideKm: location.distanceOutsideKm,
      far: location.far,
      confirmedBy: location.confirmedBy,
      feeds: location.feeds,
      kernel: { status: location.kernel.status, matched: location.kernel.matched, hazards: location.kernel.hazards.slice(0, 8), cached: location.kernel.cached ?? false, error: location.kernel.error },
    },
    photo: { exif: exif.reason, exifFactor: exif.factor, clip: photo.clip, nearestClaim: photo.nearest?.claimPublicId ?? null, cosine: photo.nearest?.cosine ?? null, dhashDistance: photo.nearest?.dhash ?? null, nearRule: photo.rule, threshold: photo.threshold, nearDuplicate: photo.nearDuplicate, unavailable: photo.unavailable, error: photo.error },
    message: { typed: message.hasText, voice: message.hasVoice, transcribed: message.transcribed, language: message.language, durationSec: message.durationSec, error: message.error },
    uniqueness: { duplicateEmail: uq.sameEmail, duplicatePhoto: uq.samePhoto, nearDuplicatePhoto: photo.nearDuplicate, reason: duplicateReason(dup) },
    vouching: { nearbyVerified: vouching.nearbyVerified, radiusKm: vouching.radiusKm, source: vouching.source, unavailable: vouching.unavailable, error: vouching.error },
    ai: { ...aiSummary, valid: aiValid, skipped: ai === null, language: assessment?.language_detected ?? null },
    timingsMs: { ...(checks.timings ?? {}), ai_and_decision: Date.now() - tFinal },
  };

  const status = decision.outcome;
  // Exactly one decision per verification: the write only happens while the claim is still VERIFYING
  // (a recovery re-run racing a slow original can't decide twice). Trail entries ride in the same transaction.
  const won = await db.$transaction(async (tx) => {
    const upd = await tx.claim.updateMany({
      where: { id: claimId, status: "VERIFYING" },
      data: {
        status,
        score: decision.score,
        disasterEventId: location.eventId,
        eventSource: location.eventSource,
        kernelStatus: location.kernel.cached && location.kernel.status !== "skipped" ? `${location.kernel.status} (cached)` : location.kernel.status,
        kernelReplayUrl: location.kernel.replayUrl ?? null,
        aiExplanation: explanation.slice(0, 1500),
        aiProvider: aiSummary.provider,
        aiModel: aiSummary.model,
        aiCached: aiSummary.cached,
        signals: { ...signals, detail } as never,
      },
    });
    if (upd.count !== 1) return false;
    await tx.decision.create({ data: { claimId, actor: "engine", outcome: decision.outcome, score: decision.score, reason: decision.reason } });
    return true;
  });
  if (!won) return storedResult(claimId);
  // Evidence is held only until the decision: photo + voice bytes are deleted now (memory and Postgres).
  await dropEvidence(claimId);

  // Side effects that must never block or undo the decision.
  if (elasticConfigured()) {
    await upsertClaimDoc({ claimPublicId: claim.claimPublicId, lat: claim.lat, lon: claim.lon, eventId: location.eventId, status, duplicate: uniqueness === 0 }).catch((e) =>
      console.error("[elastic] claim doc:", e instanceof Error ? e.message.slice(0, 120) : "error"),
    );
  }
  if (status === "IN_REVIEW") {
    await sendReviewAlert({ claimPublicId: claim.claimPublicId, score: decision.score, geoCell: claim.geoCell, redFlags: aiSummary.redFlags, aiExplanation: explanation, reason: decision.reason });
  }
  if (!aiValid) {
    await sendOpsAlert({ kind: "ai_down", severity: "high", summary: "Both AI providers failed (Gemini and Groq)", claimPublicId: claim.claimPublicId, detail: ai && !ai.ok ? ai.error : "" }, hourKey());
  }

  return { claimId, claimPublicId: claim.claimPublicId, decision, signals, explanation, ai: aiSummary, alreadyDecided: false };
}

/** Rebuild the result of an already-decided claim from the DB (idempotent retries, polling). */
export async function storedResult(claimId: string): Promise<FinalizeResult> {
  const c = await db.claim.findUniqueOrThrow({ where: { id: claimId }, include: { decisions: { where: { actor: "engine" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  const d = c.decisions[0];
  const s = (c.signals ?? {}) as Partial<Signals> & { detail?: { ai?: Partial<AiSummary> } };
  const ai = s.detail?.ai ?? {};
  return {
    claimId,
    claimPublicId: c.claimPublicId,
    decision: { outcome: (d?.outcome ?? "IN_REVIEW") as Decision["outcome"], score: d?.score ?? c.score ?? 0, reason: d?.reason ?? "" },
    signals: { photo: s.photo ?? 0, location: s.location ?? 0, message: s.message ?? 0, uniqueness: s.uniqueness ?? 0, vouching: s.vouching ?? 0 },
    explanation: c.aiExplanation ?? "",
    ai: { provider: c.aiProvider, model: c.aiModel, cached: c.aiCached, calls: ai.calls ?? { gemini: 0, groq: 0 }, scores: ai.scores ?? null, redFlags: ai.redFlags ?? [] },
    alreadyDecided: true,
  };
}

/** Inline verification (local dev, tests, and the fallback when RENDER_WORKFLOW_SERVICE_ID is empty). */
export async function verifyClaimInline(claimId: string): Promise<FinalizeResult> {
  if (!(await beginVerification(claimId))) return storedResult(claimId);
  const checks = await runChecks(claimId, inlineRunner);
  return finalizeClaim(claimId, checks);
}
