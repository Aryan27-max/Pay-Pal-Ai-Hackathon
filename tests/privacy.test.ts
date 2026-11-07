import { describe, expect, it } from "vitest";
import { claimPublicId, donorPublicId, geoCell, haversineKm, maskEmail, redactClaim, roundGeo, safeEqual } from "@/lib/privacy";
import { parseAssessment } from "@/lib/ai/contract";

const SALT = "x".repeat(40);

describe("privacy ids", () => {
  it("claim id is stable, case-insensitive, and does not contain the email", () => {
    const a = claimPublicId(SALT, "Ron@Example.com ");
    expect(a).toBe(claimPublicId(SALT, "ron@example.com"));
    expect(a).toMatch(/^c_[0-9a-f]{20}$/);
    expect(a).not.toContain("ron");
  });
  it("different salts give different ids", () => {
    expect(claimPublicId(SALT, "a@b.com")).not.toBe(claimPublicId("y".repeat(40), "a@b.com"));
  });
  it("donor and claim ids for the same input differ (domain separation)", () => {
    expect(donorPublicId(SALT, "a@b.com").slice(2)).not.toBe(claimPublicId(SALT, "a@b.com").slice(2));
  });
  it("refuses a short salt", () => {
    expect(() => claimPublicId("short", "a@b.com")).toThrow();
  });
});

describe("geo rounding", () => {
  it("snaps to a 0.1° cell centre", () => {
    expect(roundGeo(38.7812, -90.4823)).toEqual({ lat: 38.75, lon: -90.45 });
    expect(geoCell(38.7812, -90.4823)).toBe("38.75,-90.45");
  });
  it("rounded point is within ~8 km of the original", () => {
    const p = { lat: 38.7999, lon: -90.4001 };
    expect(haversineKm(p, roundGeo(p.lat, p.lon))).toBeLessThan(8);
  });
  it("haversine sanity: 1° latitude ≈ 111 km", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 0);
  });
});

describe("redaction", () => {
  it("public claim has no private fields", () => {
    const pub = redactClaim({
      claimPublicId: "c_1",
      geoCell: "38.75,-90.45",
      disasterEventId: "demo-flood",
      status: "PAID",
      score: 86,
      createdAt: new Date(0),
      // @ts-expect-error private fields must be dropped even if passed in
      paypalEmail: "secret@example.com",
      lat: 38.78,
    });
    expect(JSON.stringify(pub)).not.toContain("secret");
    expect(pub).not.toHaveProperty("lat");
  });
  it("maskEmail hides the user part", () => {
    expect(maskEmail("ronald@example.com")).toBe("ro***@example.com");
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("AI contract parsing", () => {
  const good = {
    photo_matches_disaster: 0.9,
    photo_ai_generated_risk: 0.1,
    message_consistency: 0.8,
    language_detected: "en",
    red_flags: [],
    explanation: "Flooded street matches the event.",
  };
  it("accepts valid JSON, incl. fenced", () => {
    expect(parseAssessment(JSON.stringify(good))).toEqual(good);
    expect(parseAssessment("```json\n" + JSON.stringify(good) + "\n```")).toEqual(good);
  });
  it("rejects out-of-range, missing fields, and non-JSON", () => {
    expect(parseAssessment(JSON.stringify({ ...good, photo_matches_disaster: 1.5 }))).toBeNull();
    const { explanation: _e, ...missing } = good;
    expect(parseAssessment(JSON.stringify(missing))).toBeNull();
    expect(parseAssessment("not json")).toBeNull();
    expect(parseAssessment(undefined)).toBeNull();
  });
});
