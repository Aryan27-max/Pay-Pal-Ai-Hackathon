/**
 * npm run disasters:live — proves the location check on REAL events, through the same code path the
 * claims use (activeEvents → locate). Fetches GDACS + USGS now, lists the active events, picks the most
 * recent real one, and checks a point inside its area and a point far away.
 * No claims, no PII: just coordinates of public events.
 */
import "./load-env";
import { activeEvents, checkLocation } from "@/lib/disasters";
import { distanceOutsideKm } from "@/lib/disasters/geo";
import type { DisasterEvent } from "@/lib/disasters/types";
import { db } from "@/lib/db";

function pointInside(e: DisasterEvent): { lat: number; lon: number } {
  if (e.area.kind === "circle") return e.area.center;
  // centroid of the first polygon's outer ring (good enough for the wind buffers GDACS returns)
  const ring = e.area.polygons[0]![0]!;
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lat, lon };
}

(async () => {
  const anchor = { lat: 20, lon: 80 }; // fetch polygons for events across South Asia (any point works)
  const { events, feeds } = await activeEvents(anchor);
  console.log(`feeds: GDACS ${feeds.gdacs}, USGS ${feeds.usgs}; active events: ${events.length}`);
  for (const e of events) console.log(`  [${e.source}] ${e.id}  ${e.type}  ${e.name}  (${e.region || "-"}, from ${e.startedAt})  area ${e.area.kind}${e.area.kind === "polygons" ? ` ×${e.area.polygons.length}` : ` r=${e.area.radiusKm} km`}`);
  const real = events.find((e) => e.source !== "simulated" && e.area.kind === "polygons") ?? events.find((e) => e.source !== "simulated");
  if (!real) {
    console.log("No real active event right now; nothing to look up.");
    return;
  }
  const inside = pointInside(real);
  console.log(`\nReal event lookup: ${real.name} [${real.id}]`);
  console.log(`  test point ${inside.lat.toFixed(2)}, ${inside.lon.toFixed(2)} is ${distanceOutsideKm(inside, real.area).toFixed(1)} km outside its area`);
  const r = await checkLocation(inside.lat, inside.lon);
  console.log(`  checkLocation → event ${r.eventId} (${r.eventSource}), signal ${r.signal}, far ${r.far}`);
  const far = await checkLocation(-45, -150); // South Pacific
  console.log(`  far point (-45, -150) → event ${far.eventId ?? "none"}, signal ${far.signal}, far ${far.far} (would be REJECTED by the 100 km rule)`);
})()
  .catch((e) => {
    console.error("disasters:live failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
