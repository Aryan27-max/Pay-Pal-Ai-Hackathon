import { z } from "zod";
import zoneJson from "@/simulators/fixtures/flood-zone.json";
import { haversineKm } from "@/lib/privacy";
import { locationSignal } from "@/lib/scoring";
import type { DisasterContext } from "@/lib/ai";

/**
 * Location check. Phase 1: one fixed demo flood zone (circle) from simulators/fixtures.
 * Phase 2: GDACS / USGS event areas + Kernel fallback. See .claude/skills/disaster-feeds (Phase 2).
 */

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

export type DisasterZone = z.infer<typeof ZoneSchema>;

export const DEMO_ZONE: DisasterZone = ZoneSchema.parse(zoneJson);

export type LocationCheck = {
  eventId: string | null;
  distanceKm: number;
  inside: boolean;
  signal: number;
};

export function checkLocation(lat: number, lon: number, zone: DisasterZone = DEMO_ZONE): LocationCheck {
  const distanceKm = haversineKm({ lat, lon }, zone.center);
  const signal = locationSignal(distanceKm, zone.radiusKm, zone.bufferKm);
  return { eventId: signal > 0 ? zone.eventId : null, distanceKm, inside: signal === 1, signal };
}

export function disasterContext(zone: DisasterZone = DEMO_ZONE): DisasterContext {
  return { eventId: zone.eventId, type: zone.type, name: zone.name, region: zone.region, startedAt: zone.startedAt };
}
