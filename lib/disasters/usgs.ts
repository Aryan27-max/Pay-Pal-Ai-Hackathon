import { z } from "zod";
import { cached } from "@/lib/cache";
import { EVENT_ACTIVE_DAYS } from "./gdacs";
import type { DisasterEvent } from "./types";

/**
 * USGS GeoJSON summary feed (earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php, updated every minute):
 * Point [lon, lat, depth], properties.mag, place, time (ms), url. The area is a circle sized by magnitude
 * (our heuristic, architecture.md §5): M≥7 → 150 km, M≥6 → 80 km, else 40 km.
 */
const Feature = z.object({
  id: z.string(),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.array(z.number()).min(2) }),
  properties: z.object({ mag: z.number().nullable(), place: z.string().nullable(), time: z.number(), url: z.string().nullable().optional() }).passthrough(),
});
const Collection = z.object({ features: z.array(z.unknown()) });

export const quakeRadiusKm = (mag: number | null) => (mag !== null && mag >= 7 ? 150 : mag !== null && mag >= 6 ? 80 : 40);

/** Pure (tested). */
export function usgsToEvents(features: unknown[], now = Date.now()): DisasterEvent[] {
  const out: DisasterEvent[] = [];
  for (const f of features) {
    const p = Feature.safeParse(f);
    if (!p.success || now - p.data.properties.time > EVENT_ACTIVE_DAYS * 86_400_000) continue;
    const [lon, lat] = p.data.geometry.coordinates as [number, number];
    const mag = p.data.properties.mag;
    out.push({
      id: `usgs:${p.data.id}`,
      source: "usgs",
      type: "earthquake",
      name: `M${mag ?? "?"} earthquake${p.data.properties.place ? ` – ${p.data.properties.place}` : ""}`,
      region: p.data.properties.place ?? "",
      startedAt: new Date(p.data.properties.time).toISOString().slice(0, 10),
      area: { kind: "circle", center: { lat, lon }, radiusKm: quakeRadiusKm(mag) },
      bufferKm: 10,
      url: p.data.properties.url ?? undefined,
    });
  }
  return out;
}

export async function usgsEvents(feedUrl: string): Promise<{ events: DisasterEvent[]; stale: boolean }> {
  const r = await cached(
    "usgs:feed",
    10 * 60_000,
    async () => {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
      return Collection.parse(await res.json()).features;
    },
    { staleMs: 24 * 3600_000 },
  );
  return { events: usgsToEvents(r.value), stale: r.stale };
}
