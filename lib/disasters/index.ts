import { z } from "zod";
import zoneJson from "@/simulators/fixtures/flood-zone.json";
import { env } from "@/lib/env";
import { FAR_FROM_EVENT_KM } from "@/lib/scoring";
import type { DisasterContext } from "@/lib/ai";
import { gdacsEvents } from "./gdacs";
import { locate } from "./geo";
import { usgsEvents } from "./usgs";
import type { DisasterEvent } from "./types";

/**
 * Location check (weight 25). Real events (GDACS, USGS) and the clearly labelled SIMULATED demo event go
 * through the SAME path: DisasterEvent → locate(). See .claude/skills/disaster-feeds/SKILL.md.
 */
export type { DisasterEvent } from "./types";

const ZoneSchema = z.object({
  eventId: z.string(),
  type: z.string(),
  name: z.string(),
  region: z.string(),
  startedAt: z.string(),
  center: z.object({ lat: z.number(), lon: z.number() }),
  radiusKm: z.number().positive(),
  bufferKm: z.number().min(0),
});

const zone = ZoneSchema.parse(zoneJson);

/** The SIMULATED demo event (fixture zone), as a normal DisasterEvent. */
export const SIMULATED_EVENT: DisasterEvent = {
  id: zone.eventId,
  source: "simulated",
  type: zone.type,
  name: zone.name,
  region: zone.region,
  startedAt: zone.startedAt,
  area: { kind: "circle", center: zone.center, radiusKm: zone.radiusKm },
  bufferKm: zone.bufferKm,
};

export const simulatedEnabled = () => env().SIMULATED_EVENT !== "off";

export type FeedStatus = "ok" | "stale" | "failed";

export async function activeEvents(near: { lat: number; lon: number }): Promise<{ events: DisasterEvent[]; feeds: { gdacs: FeedStatus; usgs: FeedStatus } }> {
  const e = env();
  const [g, u] = await Promise.allSettled([gdacsEvents(e.GDACS_FEED_URL, near), usgsEvents(e.USGS_FEED_URL)]);
  const st = (r: PromiseSettledResult<{ stale: boolean }>): FeedStatus => (r.status === "rejected" ? "failed" : r.value.stale ? "stale" : "ok");
  const events = [
    ...(simulatedEnabled() ? [SIMULATED_EVENT] : []),
    ...(g.status === "fulfilled" ? g.value.events : []),
    ...(u.status === "fulfilled" ? u.value.events : []),
  ];
  return { events, feeds: { gdacs: st(g), usgs: st(u) } };
}

export type LocationCheck = {
  eventId: string | null;
  eventSource: DisasterEvent["source"] | null;
  event: DisasterEvent | null;
  signal: number;
  distanceOutsideKm: number | null;
  /** Hard-rule input: true only if both feeds were read (fresh or stale) and every event is > FAR_FROM_EVENT_KM away. */
  far: boolean;
  feeds: { gdacs: FeedStatus; usgs: FeedStatus };
  candidates: number;
};

export async function checkLocation(lat: number, lon: number): Promise<LocationCheck> {
  const { events, feeds } = await activeEvents({ lat, lon });
  const loc = locate({ lat, lon }, events);
  const feedsRead = feeds.gdacs !== "failed" && feeds.usgs !== "failed";
  return {
    eventId: loc.event && !loc.far ? loc.event.id : null,
    eventSource: loc.event?.source ?? null,
    event: loc.event,
    signal: loc.signal,
    distanceOutsideKm: loc.distanceOutsideKm,
    far: feedsRead && loc.far,
    feeds,
    candidates: events.length,
  };
}

/** What the AI is told about the event (no coordinates). */
export function disasterContext(ev: DisasterEvent | null): DisasterContext {
  if (!ev) return { eventId: "none", type: "unknown", name: "No active disaster event found near the claimant", region: "unknown", startedAt: "" };
  return { eventId: ev.id, type: ev.type, name: ev.name, region: ev.region, startedAt: ev.startedAt };
}

export { FAR_FROM_EVENT_KM };
