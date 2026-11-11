import { db } from "@/lib/db";
import { getEvidence } from "@/lib/claims/evidence";
import { activeEvents, checkLocation, disasterContext, type FeedStatus } from "@/lib/disasters";
import { locate } from "@/lib/disasters/geo";
import { corroborateAlert, type KernelCheck } from "@/lib/disasters/kernel";
import type { DisasterContext } from "@/lib/ai";
import { elasticConfigured } from "@/lib/search/client";
import { countVouchers, VOUCH_STATUSES } from "@/lib/search/claims";
import { haversineKm } from "@/lib/privacy";
import { indexPhotoVariants, nearestPhotos, type PhotoMatch } from "@/lib/search/photos";
import { nearestPhotosPg, storePhotoVariantsPg } from "@/lib/search/photos-pg";
import { transcribe } from "@/lib/speech";
import { CLIP_DUPLICATE_THRESHOLD, nearDuplicateRule, type NearDupRule } from "@/lib/scoring";
import { clipEnabled, embedCrops } from "@/lib/vision/clip";
import { dHash, hamming } from "@/lib/vision/phash";
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

/* 2. Photo: EXIF + near-duplicates (perceptual dHash in Postgres + multi-crop CLIP).
 *    CLIP crops are stored and searched in Elasticsearch when ELASTIC_URL is set, otherwise in Postgres
 *    (lib/search/photos-pg: same rule, exact comparison), so free hosting keeps the cropped-photo check.
 *    The comparison and the registration of this photo happen inside ONE Postgres advisory lock, so two
 *    claims submitted at the same moment can't both miss each other: the second one through the lock
 *    always sees the first. */
export const PHOTO_LOCK_KEY = 7_340_021; // arbitrary constant, shared by all instances

export type PhotoResult = {
  exif: { present: boolean; takenAt?: string; gps?: { lat: number; lon: number } };
  dhash: string | null;
  /** The strongest match among earlier photos (null = none close). */
  nearest: { claimPublicId: string; cosine: number | null; dhash: number | null; variant?: string } | null;
  nearDuplicate: boolean;
  rule: NearDupRule | null;
  threshold: number;
  /** CLIP: on | disabled (CLIP_MODE=off: not an error) | error (configured but failing). */
  clip: "on" | "disabled" | "error";
  /** Where the crop embeddings are stored and searched (null when CLIP is off). */
  clipStore: "elastic" | "postgres" | null;
  /** True only when a CONFIGURED check failed: then the claim is never auto-paid. Disabled is not unavailable. */
  unavailable: boolean;
  error?: string;
};

export async function checkPhotoStep(claimId: string): Promise<PhotoResult> {
  const c = await loadClaim(claimId);
  const ev = await getEvidence(claimId, "photo");
  const base = { threshold: CLIP_DUPLICATE_THRESHOLD };
  if (!ev) return { ...base, exif: { present: false }, dhash: null, nearest: null, nearDuplicate: false, rule: null, clip: "error", clipStore: null, unavailable: true, error: "evidence already deleted" };
  const bytes = ev.photo;
  const exif = await readExif(bytes);
  const exifJson = { present: exif.present, ...(exif.takenAt ? { takenAt: exif.takenAt.toISOString() } : {}), ...(exif.gps ? { gps: exif.gps } : {}) };
  const myHash = await dHash(bytes);

  // Embeddings are computed OUTSIDE the lock (the slow part); only compare + register happen inside it.
  const useClip = clipEnabled();
  const clipStore: PhotoResult["clipStore"] = !useClip ? null : elasticConfigured() ? "elastic" : "postgres";
  let crops: Array<{ variant: string; vec: number[] }> = [];
  let clipState: PhotoResult["clip"] = useClip ? "on" : "disabled";
  let error: string | undefined = useClip ? undefined : "disabled: CLIP_MODE=off: dHash only";
  if (useClip) {
    try {
      crops = await embedCrops(bytes);
    } catch (e) {
      clipState = "error";
      error = errText(e);
    }
  }

  const matches = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PHOTO_LOCK_KEY})`;
      const others = await tx.claim.findMany({ where: { id: { not: claimId }, photoDhash: { not: null } }, select: { claimPublicId: true, photoDhash: true } });
      const dist = new Map(others.map((o) => [o.claimPublicId, hamming(myHash, o.photoDhash!)]));
      let clipMatches: PhotoMatch[] = [];
      const full = crops.find((v) => v.variant === "full")?.vec;
      if (clipState === "on" && full && clipStore === "postgres") {
        // Same transaction as the lock. Not caught: a failed statement aborts the transaction anyway.
        clipMatches = await nearestPhotosPg(tx, full, c.claimPublicId);
        await storePhotoVariantsPg(tx, c.claimPublicId, crops);
      } else if (clipState === "on" && full) {
        try {
          clipMatches = await nearestPhotos(full, c.claimPublicId);
          await indexPhotoVariants(c.claimPublicId, crops);
        } catch (e) {
          clipState = "error";
          error = errText(e);
        }
      }
      await tx.claim.update({ where: { id: claimId }, data: { photoDhash: myHash } });
      return { dist, clipMatches };
    },
    { timeout: 60_000, maxWait: 60_000 },
  );

  // Candidates: the closest by CLIP and the closest by dHash; each scored on BOTH signals.
  const clipBy = new Map(matches.clipMatches.map((m) => [m.claimPublicId, m]));
  const ids = new Set<string>([...matches.clipMatches.slice(0, 5).map((m) => m.claimPublicId), ...[...matches.dist.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(([id]) => id)]);
  let best: PhotoResult["nearest"] = null;
  let bestRule: NearDupRule | null = null;
  const rank = (n: NonNullable<PhotoResult["nearest"]>) => (n.cosine ?? 0) + (64 - (n.dhash ?? 64)) / 64;
  for (const id of ids) {
    const cand = { claimPublicId: id, cosine: clipBy.get(id)?.cosine ?? null, dhash: matches.dist.get(id) ?? null, variant: clipBy.get(id)?.variant };
    const rule = nearDuplicateRule({ clip: cand.cosine, dhash: cand.dhash });
    if ((rule && !bestRule) || ((Boolean(rule) === Boolean(bestRule)) && (!best || rank(cand) > rank(best)))) {
      best = cand;
      bestRule = rule;
    }
  }
  return {
    ...base,
    exif: exifJson,
    dhash: myHash,
    nearest: best,
    nearDuplicate: bestRule !== null,
    rule: bestRule,
    clip: clipState,
    clipStore,
    unavailable: clipState === "error",
    error,
  };
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
export type VouchingResult = { eventId: string | null; nearbyVerified: number; radiusKm: number; source: "elastic" | "postgres"; unavailable: boolean; error?: string };

export async function checkVouchingStep(claimId: string): Promise<VouchingResult> {
  const c = await loadClaim(claimId);
  try {
    const { events } = await activeEvents({ lat: c.lat, lon: c.lon });
    const loc = locate({ lat: c.lat, lon: c.lon }, events);
    const eventId = loc.event && !loc.far ? loc.event.id : null;
    if (!eventId) return { eventId: null, nearbyVerified: 0, radiusKm: VOUCH_RADIUS_KM, source: elasticConfigured() ? "elastic" : "postgres", unavailable: false };
    if (!elasticConfigured()) {
      // Elastic disabled: same rule from Postgres (approved, non-duplicate, same event, within 10 km).
      const n = await countVouchersPostgres({ id: c.id, lat: c.lat, lon: c.lon, eventId });
      return { eventId, nearbyVerified: n, radiusKm: VOUCH_RADIUS_KM, source: "postgres", unavailable: false };
    }
    const n = await countVouchers({ claimPublicId: c.claimPublicId, lat: c.lat, lon: c.lon, eventId, radiusKm: VOUCH_RADIUS_KM });
    return { eventId, nearbyVerified: n, radiusKm: VOUCH_RADIUS_KM, source: "elastic", unavailable: false };
  } catch (e) {
    return { eventId: null, nearbyVerified: 0, radiusKm: VOUCH_RADIUS_KM, source: elasticConfigured() ? "elastic" : "postgres", unavailable: true, error: errText(e) };
  }
}

/** Postgres fallback for vouching (Elastic disabled): bounding box in SQL, exact distance in code. */
async function countVouchersPostgres(c: { id: string; lat: number; lon: number; eventId: string }): Promise<number> {
  const dLat = VOUCH_RADIUS_KM / 111;
  const dLon = VOUCH_RADIUS_KM / (111 * Math.max(0.1, Math.cos((c.lat * Math.PI) / 180)));
  const rows = await db.claim.findMany({
    where: {
      id: { not: c.id },
      disasterEventId: c.eventId,
      status: { in: [...VOUCH_STATUSES] },
      lat: { gte: c.lat - dLat, lte: c.lat + dLat },
      lon: { gte: c.lon - dLon, lte: c.lon + dLon },
    },
    select: { lat: true, lon: true },
  });
  return rows.filter((r) => haversineKm(r, c) <= VOUCH_RADIUS_KM).length;
}

export type CheckResults = { location: LocationResult; photo: PhotoResult; message: MessageResult; uniqueness: UniquenessResult; vouching: VouchingResult };
