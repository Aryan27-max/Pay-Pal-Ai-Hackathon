/**
 * Decision engine — deterministic, pure TypeScript. The ONLY place that decides
 * approve / review / reject and how much to pay. The AI only supplies signal inputs.
 * See architecture.md §5 and .claude/skills/claim-verification/SKILL.md.
 */
import type { AiAssessment } from "@/lib/ai/contract";

export type SignalName = "photo" | "location" | "message" | "uniqueness" | "vouching";
export type Signals = Record<SignalName, number>; // each 0..1
export type Weights = Record<SignalName, number>; // sum to 100

export type ScoringConfig = {
  weights: Weights;
  autoPayoutThreshold: number; // e.g. 75
  humanReviewThreshold: number; // e.g. 50
  defaultPacketUsd: number;
  maxFirstPacketUsd: number;
};

export type Outcome = "APPROVED" | "IN_REVIEW" | "REJECTED";
export type Decision = { outcome: Outcome; score: number; reason: string };

/** Build config from env-like values (pure; no process.env access). */
export function scoringConfigFrom(e: {
  WEIGHT_PHOTO: number;
  WEIGHT_LOCATION: number;
  WEIGHT_MESSAGE: number;
  WEIGHT_UNIQUENESS: number;
  WEIGHT_VOUCHING: number;
  AUTO_PAYOUT_THRESHOLD: number;
  HUMAN_REVIEW_THRESHOLD: number;
  DEFAULT_PACKET_USD: number;
  MAX_FIRST_PACKET_USD: number;
}): ScoringConfig {
  const weights: Weights = {
    photo: e.WEIGHT_PHOTO,
    location: e.WEIGHT_LOCATION,
    message: e.WEIGHT_MESSAGE,
    uniqueness: e.WEIGHT_UNIQUENESS,
    vouching: e.WEIGHT_VOUCHING,
  };
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (Math.abs(total - 100) > 1e-9) throw new Error(`weights must sum to 100 (got ${total})`);
  if (!(e.HUMAN_REVIEW_THRESHOLD < e.AUTO_PAYOUT_THRESHOLD)) throw new Error("review threshold must be < auto threshold");
  if (!(e.DEFAULT_PACKET_USD > 0 && e.DEFAULT_PACKET_USD <= e.MAX_FIRST_PACKET_USD)) throw new Error("bad packet config");
  return {
    weights,
    autoPayoutThreshold: e.AUTO_PAYOUT_THRESHOLD,
    humanReviewThreshold: e.HUMAN_REVIEW_THRESHOLD,
    defaultPacketUsd: e.DEFAULT_PACKET_USD,
    maxFirstPacketUsd: e.MAX_FIRST_PACKET_USD,
  };
}

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/* ---------------- signal builders (pure) ---------------- */

/* ---------------- Phase 2 constants (architecture.md §5) ---------------- */

/** Raw CLIP cosine at or above which two photos are the same scene (tuned on fixtures, see clip:tune). */
export const CLIP_DUPLICATE_THRESHOLD = 0.92;
/** A claim farther than this from every active event area is rejected (appealable), with no AI call. */
export const FAR_FROM_EVENT_KM = 100;
/** No auto-payout when the photo or message signal is below this: a human looks first. */
export const CORE_EVIDENCE_FLOOR = 0.3;
/** photo_ai_generated_risk at or above this is named in the decision reason. */
export const AI_GENERATED_FLAG = 0.8;

/** EXIF confidence: plausible 1.0, missing 0.9 (stripped by most apps: never a fail), contradicting 0.6. */
export type ExifFacts = { present: boolean; takenAt?: Date; gps?: { lat: number; lon: number } };
export type ExifVerdict = { factor: number; reason: "plausible" | "missing" | "too_old" | "in_future" | "gps_far" };
export const EXIF_GPS_MAX_KM = 50;

export function exifFactor(
  exif: ExifFacts,
  ctx: { eventStart: Date; now: Date; claimPoint: { lat: number; lon: number }; distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number },
): ExifVerdict {
  if (!exif.present) return { factor: 0.9, reason: "missing" };
  const day = 24 * 3600 * 1000;
  if (exif.takenAt) {
    if (exif.takenAt.getTime() < ctx.eventStart.getTime() - day) return { factor: 0.6, reason: "too_old" };
    if (exif.takenAt.getTime() > ctx.now.getTime() + day) return { factor: 0.6, reason: "in_future" };
  }
  if (exif.gps && ctx.distanceKm(exif.gps, ctx.claimPoint) > EXIF_GPS_MAX_KM) return { factor: 0.6, reason: "gps_far" };
  return { factor: 1, reason: "plausible" };
}

/** Photo = matches disaster × (1 − AI-generated risk) × EXIF factor. */
export function photoSignal(ai: Pick<AiAssessment, "photo_matches_disaster" | "photo_ai_generated_risk">, exif = 1): number {
  return clamp01(clamp01(ai.photo_matches_disaster) * (1 - clamp01(ai.photo_ai_generated_risk)) * clamp01(exif));
}

export function messageSignal(ai: Pick<AiAssessment, "message_consistency">): number {
  return clamp01(ai.message_consistency);
}

/** Location by distance OUTSIDE the event area (0 = inside): inside 1, within the buffer 0.5, else 0. */
export function areaLocationSignal(distanceOutsideKm: number, bufferKm: number): number {
  if (!Number.isFinite(distanceOutsideKm) || distanceOutsideKm < 0) return 0;
  if (distanceOutsideKm === 0) return 1;
  return distanceOutsideKm <= bufferKm ? 0.5 : 0;
}

/** Location: inside the event area = 1, within the buffer ring = 0.5, otherwise 0. */
export function locationSignal(distanceKmFromCentre: number, radiusKm: number, bufferKm: number): number {
  if (!Number.isFinite(distanceKmFromCentre) || distanceKmFromCentre < 0) return 0;
  if (distanceKmFromCentre <= radiusKm) return 1;
  if (distanceKmFromCentre <= radiusKm + bufferKm) return 0.5;
  return 0;
}

/** Uniqueness is binary: any match on PayPal account, photo hash or a CLIP near-duplicate = 0 (hard reject). */
export function uniquenessSignal(dup: { sameEmail: boolean; samePhoto: boolean; nearDuplicatePhoto?: boolean; sameDevice?: boolean }): number {
  return dup.sameEmail || dup.samePhoto || dup.nearDuplicatePhoto || dup.sameDevice ? 0 : 1;
}

/** Which duplicate rule fired, for the reason text (first match wins). */
export function duplicateReason(dup: { sameEmail: boolean; samePhoto: boolean; nearDuplicatePhoto?: boolean; nearCosine?: number }): string | null {
  if (dup.sameEmail) return "this PayPal account already has a claim";
  if (dup.samePhoto) return "this exact photo (same SHA-256) was already submitted";
  if (dup.nearDuplicatePhoto) return `near-duplicate of an earlier claim's photo (CLIP cosine ${dup.nearCosine?.toFixed(3) ?? "?"} >= ${CLIP_DUPLICATE_THRESHOLD})`;
  return null;
}

/** Vouching: verified claims within 10 km; 2 or more = full signal. */
export function vouchingSignal(nearbyVerifiedCount: number): number {
  if (!Number.isFinite(nearbyVerifiedCount) || nearbyVerifiedCount <= 0) return 0;
  return clamp01(Math.floor(nearbyVerifiedCount) / 2);
}

/* ---------------- score + decision ---------------- */

/** Weighted total 0..100, rounded to an integer. */
export function totalScore(signals: Signals, weights: Weights): number {
  let s = 0;
  for (const k of Object.keys(weights) as SignalName[]) s += weights[k] * clamp01(signals[k]);
  return Math.round(s);
}

export type DecideOptions = {
  aiValid: boolean;
  aiFailure?: string;
  /** Which duplicate rule fired (see duplicateReason). */
  duplicate?: string | null;
  /** Set when the claim is farther than FAR_FROM_EVENT_KM from every active event. */
  farFromEvent?: { nearestKm: number | null } | null;
  /** Near-duplicate photo check could not run (Elastic/CLIP down): never auto-pay an unchecked photo. */
  photoCheckUnavailable?: boolean;
  /** Raw AI risk, only used to name the AI-generated flag in the reason. */
  aiGeneratedRisk?: number;
};

/** Short notes on weak core evidence (pure). */
export function weakEvidence(signals: Signals, aiGeneratedRisk?: number): string[] {
  const notes: string[] = [];
  if (typeof aiGeneratedRisk === "number" && aiGeneratedRisk >= AI_GENERATED_FLAG) notes.push(`photo likely AI-generated (risk ${aiGeneratedRisk.toFixed(2)})`);
  if (clamp01(signals.photo) < CORE_EVIDENCE_FLOOR) notes.push(`photo evidence weak (${clamp01(signals.photo).toFixed(2)} < ${CORE_EVIDENCE_FLOOR})`);
  if (clamp01(signals.message) < CORE_EVIDENCE_FLOOR) notes.push(`message does not fit the event (${clamp01(signals.message).toFixed(2)} < ${CORE_EVIDENCE_FLOOR})`);
  return notes;
}

/**
 * Hard rules, in order:
 *  1. uniqueness = 0 (PayPal account, photo hash or CLIP near-duplicate) → REJECTED, whatever the score
 *  2. farther than FAR_FROM_EVENT_KM from every active event → REJECTED (appealable)
 *  3. no valid AI assessment (Gemini and the Groq fallback both failed) → IN_REVIEW
 *  4. score ≥ auto → APPROVED, unless core evidence (photo or message) < CORE_EVIDENCE_FLOOR or the
 *     near-duplicate photo check could not run → IN_REVIEW
 *  5. review ≤ score < auto → IN_REVIEW; else REJECTED
 * Code-proven fraud (rules 1–2) is rejected; AI-judged problems (rule 4) go to a human.
 */
export function decide(signals: Signals, cfg: ScoringConfig, opts: DecideOptions = { aiValid: true }): Decision {
  const score = totalScore(signals, cfg.weights);
  if (clamp01(signals.uniqueness) === 0) {
    return { outcome: "REJECTED", score, reason: `duplicate: ${opts.duplicate ?? "PayPal account or photo already used"} (hard rule)` };
  }
  if (opts.farFromEvent) {
    const near = opts.farFromEvent.nearestKm;
    return {
      outcome: "REJECTED",
      score,
      reason: `not within ${FAR_FROM_EVENT_KM} km of any active disaster event${near !== null ? ` (nearest ${Math.round(near)} km away)` : " (no active events)"}; appealable (hard rule)`,
    };
  }
  if (!opts.aiValid) {
    const why = opts.aiFailure ? `: ${opts.aiFailure.slice(0, 400)}` : "";
    return { outcome: "IN_REVIEW", score, reason: `no valid AI assessment (Gemini and Groq fallback both failed); needs a human${why}` };
  }
  const weak = weakEvidence(signals, opts.aiGeneratedRisk);
  if (score >= cfg.autoPayoutThreshold) {
    if (weak.length) return { outcome: "IN_REVIEW", score, reason: `score ${score} ≥ ${cfg.autoPayoutThreshold} but no auto-payout: ${weak.join("; ")}` };
    if (opts.photoCheckUnavailable) {
      return { outcome: "IN_REVIEW", score, reason: `score ${score} ≥ ${cfg.autoPayoutThreshold} but the near-duplicate photo check could not run; needs a human` };
    }
    return { outcome: "APPROVED", score, reason: `score ${score} ≥ ${cfg.autoPayoutThreshold}` };
  }
  const note = weak.length ? `; ${weak.join("; ")}` : "";
  if (score >= cfg.humanReviewThreshold) {
    return { outcome: "IN_REVIEW", score, reason: `score ${score} in review band ${cfg.humanReviewThreshold}–${cfg.autoPayoutThreshold - 1}${note}` };
  }
  return { outcome: "REJECTED", score, reason: `score ${score} < ${cfg.humanReviewThreshold} (appealable)${note}` };
}

/* ---------------- packet sizing ---------------- */

export const toCents = (usd: number) => Math.round(usd * 100);
export const fromCents = (c: number) => c / 100;

export type PacketResult = { kind: "PAY"; amountCents: number } | { kind: "WAITING_FUNDS"; neededCents: number; poolCents: number };

/**
 * Packet = DEFAULT_PACKET_USD, never above MAX_FIRST_PACKET_USD, never above the pool.
 * If the pool cannot cover a full packet, the claim waits for funds (no partial packets).
 */
export function packetFor(cfg: ScoringConfig, poolBalanceCents: number): PacketResult {
  const amount = Math.min(toCents(cfg.defaultPacketUsd), toCents(cfg.maxFirstPacketUsd));
  const pool = Math.max(0, Math.floor(poolBalanceCents));
  if (amount <= 0) throw new Error("packet amount must be positive");
  return pool >= amount ? { kind: "PAY", amountCents: amount } : { kind: "WAITING_FUNDS", neededCents: amount, poolCents: pool };
}

/* ---------------- WAITING_FUNDS release (pure) ---------------- */

export type WaitingClaim = { id: string; createdAt: Date };

/**
 * Which WAITING_FUNDS claims a pool of `poolCents` can pay now. Strictly oldest first:
 * stop at the first claim the pool can't cover (no partial packets, no skipping ahead).
 * Every packet goes through packetFor, so caps and the pool guard stay in one place.
 */
export function planWaitingFundsRelease(cfg: ScoringConfig, poolCents: number, waiting: WaitingClaim[]): string[] {
  const queue = [...waiting].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const release: string[] = [];
  let pool = Math.max(0, Math.floor(poolCents));
  for (const c of queue) {
    const p = packetFor(cfg, pool);
    if (p.kind !== "PAY") break;
    release.push(c.id);
    pool -= p.amountCents;
  }
  return release;
}

/* ---------------- FIFO allocation (pure) ---------------- */

export type DonationBalance = { id: string; remainingCents: number; createdAt: Date };
export type AllocationPlan = { donationId: string; amountCents: number }[];

/** Match a payout to the oldest donations with money left. Throws if the pool can't cover it. */
export function planFifoAllocation(donations: DonationBalance[], payoutCents: number): AllocationPlan {
  if (!Number.isInteger(payoutCents) || payoutCents <= 0) throw new Error("payout must be a positive integer of cents");
  const sorted = [...donations]
    .filter((d) => d.remainingCents > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const plan: AllocationPlan = [];
  let left = payoutCents;
  for (const d of sorted) {
    if (left === 0) break;
    const take = Math.min(d.remainingCents, left);
    plan.push({ donationId: d.id, amountCents: take });
    left -= take;
  }
  if (left > 0) throw new Error(`insufficient pool: short by ${left} cents`);
  return plan;
}
