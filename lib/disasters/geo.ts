import { haversineKm } from "@/lib/privacy";
import { areaLocationSignal, FAR_FROM_EVENT_KM } from "@/lib/scoring";
import type { DisasterEvent, EventArea, LonLat, Polygon } from "./types";

/** Pure geometry for the location check. Distances in km. */

/** Ray casting on one ring ([lon, lat] pairs). */
export function pointInRing(lon: number, lat: number, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and not inside a hole. */
export function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  if (!poly.length || !pointInRing(lon, lat, poly[0]!)) return false;
  return !poly.slice(1).some((hole) => pointInRing(lon, lat, hole));
}

/** Distance from a point to a segment, on a local equirectangular projection (fine below ~500 km). */
function pointToSegmentKm(p: { lat: number; lon: number }, a: LonLat, b: LonLat): number {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a[0] - p.lon) * kx;
  const ay = (a[1] - p.lat) * ky;
  const bx = (b[0] - p.lon) * kx;
  const by = (b[1] - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** 0 when the point is inside the area, otherwise the distance to its edge. */
export function distanceOutsideKm(point: { lat: number; lon: number }, area: EventArea): number {
  if (area.kind === "circle") return Math.max(0, haversineKm(point, area.center) - area.radiusKm);
  let best = Infinity;
  for (const poly of area.polygons) {
    if (pointInPolygon(point.lon, point.lat, poly)) return 0;
    const outer = poly[0] ?? [];
    for (let i = 0; i + 1 < outer.length; i++) best = Math.min(best, pointToSegmentKm(point, outer[i]!, outer[i + 1]!));
  }
  return best;
}

export type Located = {
  event: DisasterEvent | null;
  distanceOutsideKm: number | null; // to the best event's area (0 = inside)
  signal: number; // 1 inside, 0.5 buffer, 0 otherwise
  far: boolean; // farther than FAR_FROM_EVENT_KM from every event (only meaningful when feeds were read)
};

/** Best event for a point: smallest distance outside its area (ties: the first, i.e. simulated → gdacs → usgs). */
export function locate(point: { lat: number; lon: number }, events: DisasterEvent[]): Located {
  let best: { e: DisasterEvent; d: number } | null = null;
  for (const e of events) {
    const d = distanceOutsideKm(point, e.area);
    if (!best || d < best.d) best = { e, d };
  }
  if (!best) return { event: null, distanceOutsideKm: null, signal: 0, far: true };
  const signal = areaLocationSignal(best.d, best.e.bufferKm);
  return { event: best.e, distanceOutsideKm: Math.round(best.d * 10) / 10, signal, far: best.d > FAR_FROM_EVENT_KM };
}
