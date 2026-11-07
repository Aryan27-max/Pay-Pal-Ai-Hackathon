import { z } from "zod";
import { cached } from "@/lib/cache";
import { haversineKm } from "@/lib/privacy";
import type { DisasterEvent, LonLat, Polygon } from "./types";

/**
 * GDACS JSON API (checked live 2026-11-07):
 *  - list:  GDACS_FEED_URL = /api/Events/geteventlist/search?eventlist=FL;TC;EQ;WF;VO → Point features
 *  - area:  properties.url.geometry = /api/polygons/getgeometry?eventtype=&eventid=&episodeid= →
 *           centroid Point + Polygons (TC wind buffers Class Poly_Green/Orange/Red, Poly_Cones = forecast cone)
 * Dates have no timezone (treated as UTC). `iscurrent` is a string and was "false" on every event; we use dates.
 */
export const EVENT_ACTIVE_DAYS = 30;
const POLYGON_LOOKUP_KM = 1500; // fetch an event's polygons only if its centroid is this close to the claim
const TYPES: Record<string, string> = { FL: "flood", TC: "tropical_cyclone", EQ: "earthquake", WF: "wildfire", VO: "volcano" };
const DEFAULT_RADIUS_KM: Record<string, number> = { FL: 100, TC: 200, EQ: 100, WF: 30, VO: 30 };
const UA = { "User-Agent": "ReliefStream/0.1 (hackathon; disaster feed reader)" };

const Feature = z.object({
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable(),
  properties: z
    .object({
      eventtype: z.string(),
      eventid: z.number(),
      episodeid: z.number(),
      name: z.string().optional().default(""),
      country: z.string().nullable().optional(),
      fromdate: z.string(),
      todate: z.string(),
      alertlevel: z.string().optional(),
      url: z.object({ geometry: z.string().optional(), report: z.string().optional() }).partial().optional(),
    })
    .passthrough(),
});
const Collection = z.object({ features: z.array(z.unknown()) });

export type GdacsRaw = z.infer<typeof Feature>;

const utc = (d: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d : `${d}Z`);

/** Pure: keep active events of the types we serve (tested). */
export function activeGdacs(features: unknown[], now = Date.now()): GdacsRaw[] {
  const out: GdacsRaw[] = [];
  for (const f of features) {
    const p = Feature.safeParse(f);
    if (!p.success || !TYPES[p.data.properties.eventtype] || p.data.geometry?.type !== "Point") continue;
    const end = utc(p.data.properties.todate);
    if (Number.isFinite(end) && now - end <= EVENT_ACTIVE_DAYS * 86_400_000) out.push(p.data);
  }
  return out;
}

/** Pure: polygons from a getgeometry FeatureCollection (cones and lines skipped). */
export function polygonsFromGeometry(fc: unknown): Polygon[] {
  const features = (fc as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: { Class?: string } }> })?.features ?? [];
  const polys: Polygon[] = [];
  for (const f of features) {
    if (f.properties?.Class === "Poly_Cones") continue;
    if (f.geometry?.type === "Polygon") polys.push(f.geometry.coordinates as LonLat[][]);
    else if (f.geometry?.type === "MultiPolygon") polys.push(...(f.geometry.coordinates as LonLat[][][]));
  }
  return polys;
}

export function toEvent(raw: GdacsRaw, polygons: Polygon[] | null): DisasterEvent {
  const p = raw.properties;
  const [lon, lat] = raw.geometry!.coordinates as [number, number];
  const centroid = { lat, lon };
  return {
    id: `gdacs:${p.eventtype}:${p.eventid}:${p.episodeid}`,
    source: "gdacs",
    type: TYPES[p.eventtype]!,
    name: p.name || `${p.eventtype} ${p.eventid}`,
    region: p.country ?? "",
    startedAt: new Date(utc(p.fromdate)).toISOString().slice(0, 10),
    area: polygons?.length ? { kind: "polygons", polygons, centroid } : { kind: "circle", center: centroid, radiusKm: DEFAULT_RADIUS_KM[p.eventtype] ?? 100 },
    bufferKm: 10,
    url: p.url?.report,
  };
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`GDACS HTTP ${r.status}`);
  return r.json();
}

/** Active GDACS events; polygons fetched (and cached 6 h) only for events near the point. */
export async function gdacsEvents(listUrl: string, near: { lat: number; lon: number }): Promise<{ events: DisasterEvent[]; stale: boolean }> {
  // Cache only the active events we serve (a few KB), not the whole list (~120 KB).
  const list = await cached("gdacs:active", 15 * 60_000, async () => activeGdacs(Collection.parse(await getJson(listUrl)).features), { staleMs: 24 * 3600_000 });
  const raws = activeGdacs(list.value); // re-applies the 30-day window to a stale copy
  const events = await Promise.all(
    raws.map(async (raw) => {
      const [lon, lat] = raw.geometry!.coordinates as [number, number];
      const geomUrl = raw.properties.url?.geometry;
      if (!geomUrl || haversineKm(near, { lat, lon }) > POLYGON_LOOKUP_KM) return toEvent(raw, null);
      const key = `gdacs:geom:${raw.properties.eventtype}:${raw.properties.eventid}:${raw.properties.episodeid}`;
      const polys = await cached(key, 6 * 3600_000, async () => polygonsFromGeometry(await getJson(geomUrl)), { staleMs: 7 * 86_400_000 }).catch(() => null);
      return toEvent(raw, polys?.value ?? null);
    }),
  );
  return { events, stale: list.stale };
}
