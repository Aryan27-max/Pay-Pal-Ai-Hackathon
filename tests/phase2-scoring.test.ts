import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/privacy";
import {
  areaLocationSignal,
  CLIP_DUPLICATE_THRESHOLD,
  COMBINED_CLIP_MIN,
  COMBINED_DHASH_MAX,
  CORE_EVIDENCE_FLOOR,
  DHASH_DUPLICATE_MAX,
  nearDuplicateRule,
  decide,
  duplicateReason,
  exifFactor,
  FAR_FROM_EVENT_KM,
  photoSignal,
  uniquenessSignal,
  weakEvidence,
  type ScoringConfig,
  type Signals,
} from "@/lib/scoring";

const cfg: ScoringConfig = {
  weights: { photo: 30, location: 25, message: 20, uniqueness: 15, vouching: 10 },
  autoPayoutThreshold: 75,
  humanReviewThreshold: 50,
  defaultPacketUsd: 50,
  maxFirstPacketUsd: 100,
};
const good: Signals = { photo: 0.9, location: 1, message: 0.95, uniqueness: 1, vouching: 1 };
const ctx = { eventStart: new Date("2026-11-04T00:00:00Z"), now: new Date("2026-11-07T12:00:00Z"), claimPoint: { lat: 38.79, lon: -90.43 }, distanceKm: haversineKm };

describe("EXIF factor (missing EXIF is never a fail)", () => {
  it("missing → 0.9", () => expect(exifFactor({ present: false }, ctx)).toEqual({ factor: 0.9, reason: "missing" }));
  it("taken during the event, near the claim → 1", () =>
    expect(exifFactor({ present: true, takenAt: new Date("2026-11-05T10:00:00Z"), gps: { lat: 38.8, lon: -90.44 } }, ctx).factor).toBe(1));
  it("taken more than a day before the event → 0.6", () => expect(exifFactor({ present: true, takenAt: new Date("2025-06-01T00:00:00Z") }, ctx)).toEqual({ factor: 0.6, reason: "too_old" }));
  it("taken in the future → 0.6", () => expect(exifFactor({ present: true, takenAt: new Date("2026-12-01T00:00:00Z") }, ctx).reason).toBe("in_future"));
  it("EXIF GPS > 50 km from the claim → 0.6", () => expect(exifFactor({ present: true, gps: { lat: 39.74, lon: -104.99 } }, ctx).reason).toBe("gps_far"));
  it("photo signal multiplies the EXIF factor in", () => {
    expect(photoSignal({ photo_matches_disaster: 1, photo_ai_generated_risk: 0 }, 0.9)).toBeCloseTo(0.9);
    expect(photoSignal({ photo_matches_disaster: 0.9, photo_ai_generated_risk: 0.95 })).toBeLessThan(CORE_EVIDENCE_FLOOR);
  });
});

describe("location by area distance", () => {
  it("inside 1, buffer 0.5, beyond 0", () => {
    expect(areaLocationSignal(0, 10)).toBe(1);
    expect(areaLocationSignal(10, 10)).toBe(0.5);
    expect(areaLocationSignal(10.1, 10)).toBe(0);
    expect(areaLocationSignal(Number.NaN, 10)).toBe(0);
  });
});

describe("uniqueness: account, hash and CLIP near-duplicate", () => {
  it("a near-duplicate photo alone makes uniqueness 0", () => {
    expect(uniquenessSignal({ sameEmail: false, samePhoto: false, nearDuplicatePhoto: true })).toBe(0);
    expect(uniquenessSignal({ sameEmail: false, samePhoto: false, nearDuplicatePhoto: false })).toBe(1);
  });
  it("names the rule that fired, account first, then hash, then CLIP", () => {
    expect(duplicateReason({ sameEmail: true, samePhoto: true, nearDuplicatePhoto: true })).toMatch(/PayPal account/);
    expect(duplicateReason({ sameEmail: false, samePhoto: true, nearDuplicatePhoto: true })).toMatch(/SHA-256/);
    expect(duplicateReason({ sameEmail: false, samePhoto: false, nearDuplicatePhoto: true, nearCosine: 0.9393, nearDhash: 15, nearRule: "clip" })).toMatch(/CLIP 0\.939, dHash 15: CLIP >= 0\.92/);
    expect(duplicateReason({ sameEmail: false, samePhoto: false, nearDuplicatePhoto: true, nearCosine: 0.89, nearDhash: 18, nearRule: "clip+dhash" })).toMatch(/CLIP ≥ 0\.88 and dHash ≤ 19/);
    expect(duplicateReason({ sameEmail: false, samePhoto: false })).toBeNull();
  });
  it("threshold is the tuned value recorded in architecture.md", () => expect(CLIP_DUPLICATE_THRESHOLD).toBe(0.92));
});

describe("near-duplicate rule: multi-crop CLIP + dHash (values measured on the fixtures)", () => {
  it("catches every measured edit of genuine-1", () => {
    expect(nearDuplicateRule({ clip: 0.9356, dhash: 1 })).toBe("clip"); // resize 50% + q50
    expect(nearDuplicateRule({ clip: 0.9393, dhash: 15 })).toBe("clip"); // crop fixture
    expect(nearDuplicateRule({ clip: 0.953, dhash: 18 })).toBe("clip"); // HEAVY: crop 75% + resize 640 + brightness (multi-crop CLIP)
    expect(nearDuplicateRule({ clip: 0.9613, dhash: 28 })).toBe("clip"); // mirror
    expect(nearDuplicateRule({ clip: null, dhash: 7 })).toBe("dhash"); // brightness, Elasticsearch off
    expect(nearDuplicateRule({ clip: 0.8936, dhash: 19 })).toBe("clip+dhash"); // heavy edit of genuine-3
  });
  it("never flags two DIFFERENT fixture photos (closest pairs measured)", () => {
    expect(nearDuplicateRule({ clip: 0.9125, dhash: 26 })).toBeNull(); // genuine-1 vs crops of another flooded street
    expect(nearDuplicateRule({ clip: 0.8986, dhash: 36 })).toBeNull();
    expect(nearDuplicateRule({ clip: 0.5683, dhash: 20 })).toBeNull(); // smallest dHash between different photos
    expect(nearDuplicateRule({ clip: 0.7378, dhash: 21 })).toBeNull();
  });
  it("known limit: a heavy edit that matches neither signal is not caught", () => {
    expect(nearDuplicateRule({ clip: 0.8927, dhash: 26 })).toBeNull(); // heavy edit of genuine-2 (documented)
  });
  it("thresholds", () => {
    expect([CLIP_DUPLICATE_THRESHOLD, DHASH_DUPLICATE_MAX, COMBINED_CLIP_MIN, COMBINED_DHASH_MAX]).toEqual([0.92, 12, 0.88, 19]);
  });
});

describe("decide: Phase 2 hard rules", () => {
  it("CLIP near-duplicate with a perfect score is still REJECTED", () => {
    const d = decide({ ...good, uniqueness: 0 }, cfg, { aiValid: true, duplicate: duplicateReason({ sameEmail: false, samePhoto: false, nearDuplicatePhoto: true, nearCosine: 0.94 }) });
    expect(d.outcome).toBe("REJECTED");
    expect(d.reason).toMatch(/near-duplicate/);
  });
  it(`farther than ${FAR_FROM_EVENT_KM} km from every event → REJECTED (appealable), before the AI rule`, () => {
    const d = decide({ ...good, location: 0, vouching: 0 }, cfg, { aiValid: false, farFromEvent: { nearestKm: 1180 } });
    expect(d.outcome).toBe("REJECTED");
    expect(d.reason).toMatch(/not within 100 km .*nearest 1180 km.*appealable/);
  });
  it("duplicate wins over far-from-event", () => {
    expect(decide({ ...good, uniqueness: 0 }, cfg, { aiValid: true, farFromEvent: { nearestKm: 500 }, duplicate: "x" }).reason).toMatch(/^duplicate/);
  });
  it("score ≥ 75 but a contradicting message → IN_REVIEW, never auto-paid", () => {
    const s: Signals = { photo: 0.85, location: 1, message: 0.05, uniqueness: 1, vouching: 1 };
    const d = decide(s, cfg, { aiValid: true });
    expect(d.score).toBeGreaterThanOrEqual(75);
    expect(d.outcome).toBe("IN_REVIEW");
    expect(d.reason).toMatch(/message does not fit the event/);
  });
  it("likely AI-generated photo is named in the reason and blocks auto-payout", () => {
    const s: Signals = { photo: 0.04, location: 1, message: 0.9, uniqueness: 1, vouching: 1 };
    const d = decide(s, cfg, { aiValid: true, aiGeneratedRisk: 0.95 });
    expect(d.outcome).toBe("IN_REVIEW");
    expect(d.reason).toMatch(/AI-generated \(risk 0\.95\)/);
  });
  it("photo check unavailable (Elastic down) → IN_REVIEW instead of auto-pay", () => {
    expect(decide(good, cfg, { aiValid: true, photoCheckUnavailable: true }).outcome).toBe("IN_REVIEW");
  });
  it("healthy claim is still APPROVED with all the new options off", () => {
    expect(decide(good, cfg, { aiValid: true, photoCheckUnavailable: false, farFromEvent: null }).outcome).toBe("APPROVED");
  });
  it("weakEvidence lists only what is below the floor", () => {
    expect(weakEvidence(good)).toEqual([]);
    expect(weakEvidence({ ...good, message: 0.1 })).toHaveLength(1);
  });
});
