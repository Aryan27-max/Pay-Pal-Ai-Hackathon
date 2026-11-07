import { db } from "@/lib/db";
import { getEvidence } from "@/lib/claims/evidence";
import { activeEvents, checkLocation, disasterContext, type FeedStatus } from "@/lib/disasters";
import { locate } from "@/lib/disasters/geo";
import { corroborateAlert, type KernelCheck } from "@/lib/disasters/kernel";
import type { DisasterContext } from "@/lib/ai";
import { elasticConfigured } from "@/lib/search/client";
import { countVouchers } from "@/lib/search/claims";
import { indexPhoto, nearestPhoto } from "@/lib/search/photos";
import { transcribe } from "@/lib/speech";
import { CLIP_DUPLICATE_THRESHOLD } from "@/lib/scoring";
import { embedImage } from "@/lib/vision/clip";
import { readExif } from "@/lib/vision/exif";

/**
 * The five verification checks. Each takes a claim id, reads what it needs from Postgres (evidence bytes
 * stay in claim_evidence, never in task arguments) and returns a small JSON result. They are independent,
 * so verify_claim runs them in parallel (Render Workflows tasks, or Promise.all inline).
 * No check decides anything: lib/scoring does, in finalizeClaim.
 */
export const VOUCH_RADIUS_KM = 10;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);

async function loadClaim(claimId: string) {
  return db.claim.findUniqueOrThrow({ where: { id: claimId } });
}

/* 1. Location: GDACS + USGS + SIMULATED event, plus the optional Kernel official-page corroboration. */
export type LocationResult = {
  eventId: string | null;
  eventSource: string | null;
  context: DisasterContext;
  eventStart: string | null;
  signal: number;
  distanceOutsideKm: number | null;
  far: boolean;
  confirmedBy: "feeds" | "official_page" | "none";
  feeds: { gdacs: FeedStatus; usgs: FeedStatus };
  kernel: KernelCheck;
};

export async function checkLocationStep(claimId: string): Promise<LocationResult> {
  const c = await loadClaim(claimId);
  const [loc, kernel] = await Promise.all([
    checkLocation(c.lat, c.lon),
    // Kernel runs alongside the feeds with its own hard timeout; its result can only raise the signal.
    (async () => {
      const near = await activeEvents({ lat: c.lat, lon: c.lon }).catch(() => null);
      const type = near ? (locate({ lat: c.lat, lon: c.lon }, near.events).event?.type ?? "flood") : "flood";
      return corroborateAlert(Math.round(c.lat * 100) / 100, Math.round(c.lon * 100) / 100, type, c.geoCell);
    })(),
  ]);
  const official = kernel.status === "active";
  const raised = official && loc.signal < 1;
  return {
    eventId: loc.eventId,
    eventSource: loc.eventSource,
    context: disasterContext(loc.far && !official ? null : loc.event),
    eventStart: loc.event?.startedAt ?? null,
    signal: raised ? 1 : loc.signal,
    distanceOutsideKm: loc.distanceOutsideKm,
    far: loc.far && !official,
    confirmedBy: raised ? "official_page" : loc.signal > 0 ? "feeds" : "none",
    feeds: loc.feeds,
    kernel,
  };
}

/* 2. Photo: EXIF + CLIP near-duplicate (Elastic kNN). The photo is indexed after the search. */
export type PhotoResult = {
  exif: { present: boolean; takenAt?: string; gps?: { lat: number; lon: number } };
  nearest: { claimPublicId: string; cosine: number } | null;
  nearDuplicate: boolean;
  threshold: number;
  unavailable: boolean;
  error?: string;
};

export async function checkPhotoStep(claimId: string): Promise<PhotoResult> {
  const c = await loadClaim(claimId);
  const ev = await getEvidence(claimId, "photo");
  if (!ev) return { exif: { present: false }, nearest: null, nearDuplicate: false, threshold: CLIP_DUPLICATE_THRESHOLD, unavailable: true, error: "evidence already deleted" };
  const bytes = ev.photo;
  const exif = await readExif(bytes);
  const exifJson = { present: exif.present, ...(exif.takenAt ? { takenAt: exif.takenAt.toISOString() } : {}), ...(exif.gps ? { gps: exif.gps } : {}) };
  if (!elasticConfigured()) return { exif: exifJson, nearest: null, nearDuplicate: false, threshold: CLIP_DUPLICATE_THRESHOLD, unavailable: true, error: "Elastic not configured" };
  try {
    const vec = await embedImage(bytes);
    const nearest = await nearestPhoto(vec, c.claimPublicId);
    await indexPhoto(c.claimPublicId, vec);
    return { exif: exifJson, nearest, nearDuplicate: Boolean(nearest && nearest.cosine >= CLIP_DUPLICATE_THRESHOLD), threshold: CLIP_DUPLICATE_THRESHOLD, unavailable: false };
  } catch (e) {
    return { exif: exifJson, nearest: null, nearDuplicate: false, threshold: CLIP_DUPLICATE_THRESHOLD, unavailable: true, error: errText(e) };
  }
}

/* 3. Message: transcribe the voice note (if any). The transcript is stored on the claim (private) and
 *    NOT returned, so it never sits in workflow run results. */
export type MessageResult = { hasText: boolean; hasVoice: boolean; transcribed: boolean; language: string | null; durationSec: number | null; chars: number; error?: string };

export async function checkMessageStep(claimId: string): Promise<MessageResult> {
  const c = await loadClaim(claimId);
  const hasText = c.messageText.trim().length > 0;
  const ev = c.audioSha256 ? await getEvidence(claimId, "audio") : null;
  if (!ev?.audio) return { hasText, hasVoice: Boolean(c.audioSha256), transcribed: Boolean(c.transcript), language: c.transcriptLang, durationSec: null, chars: c.transcript?.length ?? 0 };
  try {
    const t = await transcribe({ bytes: ev.audio, mimeType: ev.audioMime ?? "audio/wav" });
    await db.claim.update({ where: { id: claimId }, data: { transcript: t.text.slice(0, 4000), transcriptLang: t.language } });
    return { hasText, hasVoice: true, transcribed: true, language: t.language, durationSec: t.durationSec, chars: t.text.length };
  } catch (e) {
    return { hasText, hasVoice: true, transcribed: false, language: null, durationSec: null, chars: 0, error: errText(e) };
  }
}

/* 4. Uniqueness: same PayPal account or same photo bytes on any other claim (Postgres). */
export type UniquenessResult = { sameEmail: boolean; samePhoto: boolean };

export async function checkUniquenessStep(claimId: string): Promise<UniquenessResult> {
  const c = await loadClaim(claimId);
  const [sameEmail, samePhoto] = await Promise.all([
    db.claim.count({ where: { id: { not: claimId }, paypalEmail: c.paypalEmail } }),
    db.claim.count({ where: { id: { not: claimId }, photoSha256: c.photoSha256 } }),
  ]);
  return { sameEmail: sameEmail > 0, samePhoto: samePhoto > 0 };
}

/* 5. Vouching: approved, non-duplicate claims of the same event within 10 km (Elastic geo query). */
export type VouchingResult = { eventId: string | null; nearbyVerified: number; radiusKm: number; unavailable: boolean; error?: string };

export async function checkVouchingStep(claimId: string): Promise<VouchingResult> {
  const c = await loadClaim(claimId);
  try {
    const { events } = await activeEvents({ lat: c.lat, lon: c.lon });
    const loc = locate({ lat: c.lat, lon: c.lon }, events);
    const eventId = loc.event && !loc.far ? loc.event.id : null;
    if (!eventId) return { eventId: null, nearbyVerified: 0, radiusKm: VOUCH_RADIUS_KM, unavailable: false };
    if (!elasticConfigured()) return { eventId, nearbyVerified: 0, radiusKm: VOUCH_RADIUS_KM, unavailable: true, error: "Elastic not configured" };
    const n = await countVouchers({ claimPublicId: c.claimPublicId, lat: c.lat, lon: c.lon, eventId, radiusKm: VOUCH_RADIUS_KM });
    return { eventId, nearbyVerified: n, radiusKm: VOUCH_RADIUS_KM, unavailable: false };
  } catch (e) {
    return { eventId: null, nearbyVerified: 0, radiusKm: VOUCH_RADIUS_KM, unavailable: true, error: errText(e) };
  }
}

export type CheckResults = { location: LocationResult; photo: PhotoResult; message: MessageResult; uniqueness: UniquenessResult; vouching: VouchingResult };
