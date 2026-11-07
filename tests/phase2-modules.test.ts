import { describe, expect, it, vi } from "vitest";

// Modules below import the Prisma client / env for their I/O parts; the tested functions are pure.
vi.mock("@/lib/db", () => ({ db: {} }));

import { distanceOutsideKm, locate, pointInPolygon } from "@/lib/disasters/geo";
import { activeGdacs, polygonsFromGeometry, toEvent } from "@/lib/disasters/gdacs";
import { quakeRadiusKm, usgsToEvents } from "@/lib/disasters/usgs";
import { extractHazards, matchHazards, nwsPageUrl } from "@/lib/disasters/kernel";
import type { DisasterEvent } from "@/lib/disasters/types";
import { parseGroqTranscript, toIso639 } from "@/lib/speech";
import { opsPayload, reviewPayload } from "@/lib/alerts";
import { scoreToCosine } from "@/lib/search/client";
import { nearDuplicateQuery } from "@/lib/search/photos";
import { claimDocument, roundForIndex, vouchQuery } from "@/lib/search/claims";
import { cosine, normalise } from "@/lib/vision/clip";

const square = [
  [
    [-91, 38],
    [-90, 38],
    [-90, 39],
    [-91, 39],
    [-91, 38],
  ],
] as [number, number][][];

const simulated: DisasterEvent = {
  id: "demo",
  source: "simulated",
  type: "flood",
  name: "Missouri River flood (SIMULATED demo event)",
  region: "St. Charles",
  startedAt: "2026-11-04",
  area: { kind: "circle", center: { lat: 38.7881, lon: -90.4974 }, radiusKm: 20 },
  bufferKm: 10,
};

describe("geo: point in area", () => {
  it("point in polygon, holes respected", () => {
    expect(pointInPolygon(-90.5, 38.5, square)).toBe(true);
    expect(pointInPolygon(-89.5, 38.5, square)).toBe(false);
    const withHole = [...square, [[-90.6, 38.4], [-90.4, 38.4], [-90.4, 38.6], [-90.6, 38.6], [-90.6, 38.4]]] as [number, number][][];
    expect(pointInPolygon(-90.5, 38.5, withHole)).toBe(false);
  });
  it("distance outside: 0 inside, ~km to the edge outside", () => {
    expect(distanceOutsideKm({ lat: 38.5, lon: -90.5 }, { kind: "polygons", polygons: [square], centroid: { lat: 38.5, lon: -90.5 } })).toBe(0);
    const d = distanceOutsideKm({ lat: 38.5, lon: -89.9 }, { kind: "polygons", polygons: [square], centroid: { lat: 38.5, lon: -90.5 } });
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(10);
  });
  it("simulated and real events go through the same locate(): best event wins", () => {
    const real: DisasterEvent = { ...simulated, id: "gdacs:FL:1:1", source: "gdacs", area: { kind: "polygons", polygons: [square], centroid: { lat: 38.5, lon: -90.5 } } };
    expect(locate({ lat: 38.79, lon: -90.43 }, [simulated, real])).toMatchObject({ signal: 1, far: false });
    expect(locate({ lat: 39.09, lon: -90.95 }, [simulated]).signal).toBe(0); // borderline: 55 km from centre
    expect(locate({ lat: 39.7392, lon: -104.9903 }, [simulated])).toMatchObject({ signal: 0, far: true }); // Denver
    expect(locate({ lat: 0, lon: 0 }, [])).toMatchObject({ event: null, far: true });
  });
});

describe("GDACS + USGS parsing", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const feature = (type: string, todate: string) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [80.2, 15.8] },
    properties: { eventtype: type, eventid: 1001346, episodeid: 10, name: "Tropical Cyclone MURASU-26", country: "India", fromdate: "2026-11-01T00:00:00", todate, iscurrent: "false", url: { geometry: "https://x/geom", report: "https://x/report" } },
  });
  it("keeps served types active within 30 days, ignores iscurrent and droughts", () => {
    const out = activeGdacs([feature("TC", "2026-11-03T06:00:00"), feature("DR", "2026-11-05T00:00:00"), feature("FL", "2026-09-01T00:00:00"), { junk: true }], now);
    expect(out.map((f) => f.properties.eventtype)).toEqual(["TC"]);
  });
  it("polygons from getgeometry skip the forecast cone and lines", () => {
    const fc = {
      features: [
        { geometry: { type: "Point", coordinates: [80, 15] }, properties: { Class: "Point_Centroid" } },
        { geometry: { type: "Polygon", coordinates: square }, properties: { Class: "Poly_Red" } },
        { geometry: { type: "Polygon", coordinates: square }, properties: { Class: "Poly_Cones" } },
        { geometry: { type: "LineString", coordinates: [] }, properties: { Class: "Line_Line_0" } },
      ],
    };
    expect(polygonsFromGeometry(fc)).toHaveLength(1);
  });
  it("toEvent: polygons when known, else a radius by type", () => {
    const raw = activeGdacs([feature("TC", "2026-11-03T06:00:00")], now)[0]!;
    expect(toEvent(raw, null).area).toEqual({ kind: "circle", center: { lat: 15.8, lon: 80.2 }, radiusKm: 200 });
    expect(toEvent(raw, [square]).area.kind).toBe("polygons");
    expect(toEvent(raw, null)).toMatchObject({ id: "gdacs:TC:1001346:10", type: "tropical_cyclone", startedAt: "2026-11-01" });
  });
  it("USGS: circle by magnitude, recent quakes only", () => {
    expect([quakeRadiusKm(7.2), quakeRadiusKm(6.1), quakeRadiusKm(5), quakeRadiusKm(null)]).toEqual([150, 80, 40, 40]);
    const f = (time: number) => ({ id: "us7000x", geometry: { type: "Point", coordinates: [85.3, 27.7, 10] }, properties: { mag: 6.4, place: "Nepal", time, url: "u" } });
    expect(usgsToEvents([f(now - 86_400_000), f(now - 60 * 86_400_000)], now)).toHaveLength(1);
  });
});

describe("Kernel extraction", () => {
  it("only matching hazard products corroborate", () => {
    expect(matchHazards(["Freeze Warning", "Flood Warning"], "flood")).toEqual(["Flood Warning"]);
    expect(matchHazards(["Freeze Warning"], "flood")).toEqual([]);
    expect(matchHazards(["Flood Warning"], "earthquake")).toEqual([]);
  });
  it("reads hazard products from the NWS page HTML", () => {
    const html = '<div id="hazards"><h3>Hazardous Weather Conditions</h3><ul><li><a href="showsigwx.php?warnzone=MOZ061&amp;warncounty=MOC183&amp;product1=Flood+Warning">Flood  Warning</a></li><li><a href="showsigwx.php?warnzone=MOZ061&amp;product1=Freeze+Warning">Freeze Warning until November 7, 08:00 AM CST</a></li></ul></div><a href="other.php">x</a>';
    expect(extractHazards(html)).toEqual(["Flood Warning", "Freeze Warning until November 7, 08:00 AM CST"]);
    expect(extractHazards("<html><body>7-Day Forecast</body></html>")).toEqual([]);
  });
  it("page URL uses a 2-decimal (~1 km) point", () => expect(nwsPageUrl(38.79051, -90.43011)).toBe("https://forecast.weather.gov/MapClick.php?lat=38.79&lon=-90.43"));
});

describe("speech", () => {
  it("parses the live Groq verbose_json shape and maps the language name", () => {
    expect(parseGroqTranscript({ task: "transcribe", language: "English", duration: 13.500000256, text: " Hello. ", segments: [] })).toEqual({ text: "Hello.", language: "en", durationSec: 13.5, provider: "groq" });
    expect(toIso639("Hindi")).toBe("hi");
    expect(toIso639("es")).toBe("es");
    expect(toIso639(undefined)).toBe("und");
    expect(() => parseGroqTranscript({ error: "x" })).toThrow();
  });
});

describe("alerts carry no PII", () => {
  it("review + ops payloads have no email, message, transcript or coordinates", () => {
    const r = reviewPayload({ claimPublicId: "c_1", score: 61, geoCell: "38.75,-90.45", redFlags: ["x"], aiExplanation: "e", reason: "r" }, "https://app.example/");
    const o = opsPayload({ kind: "payout_failed", severity: "high", summary: "s", claimPublicId: "c_1" });
    for (const p of [r, o]) {
      const keys = Object.keys(p).join(",");
      expect(keys).not.toMatch(/email|message|transcript|lat|lon|photo/);
    }
    expect(r.review_url).toBe("https://app.example/review?claim=c_1");
  });
});

describe("Elastic queries (pure builders)", () => {
  it("kNN excludes the claim itself; score ↔ cosine", () => {
    const q = nearDuplicateQuery([0.1, 0.2], "c_self");
    expect(q.knn.filter.bool.must_not[0]).toEqual({ term: { claim_public_id: "c_self" } });
    expect(scoreToCosine((1 + 0.92) / 2)).toBeCloseTo(0.92);
  });
  it("claim doc: ~1 km rounding, no PII fields", () => {
    const d = claimDocument({ claimPublicId: "c_1", lat: 38.79051, lon: -90.43011, eventId: null, status: "PAID", duplicate: false });
    expect(d.location).toEqual({ lat: 38.79, lon: -90.43 });
    expect(d.event_id).toBe("none");
    expect(Object.keys(d).join(",")).not.toMatch(/email|message|photo/);
    expect(roundForIndex(-90.435)).toBeCloseTo(-90.43, 2);
  });
  it("vouch query: same event, verified statuses, not duplicates, 10 km", () => {
    const q = vouchQuery({ claimPublicId: "c_1", lat: 38.79, lon: -90.43, eventId: "demo", radiusKm: 10 });
    const f = q.query.bool.filter;
    expect(f).toContainEqual({ term: { event_id: "demo" } });
    expect(f).toContainEqual({ term: { duplicate: false } });
    expect(JSON.stringify(f)).toContain('"distance":"10km"');
    expect(JSON.stringify(f)).not.toContain("REJECTED");
  });
});

describe("CLIP helpers", () => {
  it("normalised vectors: cosine = dot", () => {
    const a = normalise([3, 4]);
    expect(cosine(a, a)).toBeCloseTo(1);
    expect(cosine(normalise([1, 0]), normalise([0, 1]))).toBeCloseTo(0);
  });
});

describe("perceptual hash (dHash)", () => {
  it("hamming distance on 64-bit hex hashes", async () => {
    const { hamming } = await import("@/lib/vision/phash");
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("f0f0f0f0f0f0f0f0", "f0f0f0f0f0f0f0f1")).toBe(1);
  });
  it("same photo resized + re-compressed stays close; different photos are far", async () => {
    const fs = await import("node:fs");
    const sharp = (await import("sharp")).default;
    const { dHash, hamming } = await import("@/lib/vision/phash");
    const g1 = fs.readFileSync("simulators/fixtures/photos/genuine-1.jpg");
    const small = await sharp(g1).resize(400).jpeg({ quality: 50 }).toBuffer();
    const other = fs.readFileSync("simulators/fixtures/photos/genuine-2.jpg");
    expect(hamming(await dHash(g1), await dHash(small))).toBeLessThanOrEqual(12);
    expect(hamming(await dHash(g1), await dHash(other))).toBeGreaterThan(19);
  });
});
