/** One disaster event, whatever its source. Real feeds and the SIMULATED demo event share this shape. */
export type LonLat = [number, number];
/** A polygon = rings of [lon, lat]; the first ring is the outer boundary, the rest are holes (GeoJSON). */
export type Polygon = LonLat[][];

export type EventArea =
  | { kind: "circle"; center: { lat: number; lon: number }; radiusKm: number }
  | { kind: "polygons"; polygons: Polygon[]; centroid: { lat: number; lon: number } };

export type EventSource = "simulated" | "gdacs" | "usgs";

export type DisasterEvent = {
  id: string; // e.g. gdacs:FL:1103320:2, usgs:us7000abcd, demo-flood-stcharles-2026
  source: EventSource;
  type: string; // flood | earthquake | tropical_cyclone | wildfire | volcano
  name: string;
  region: string;
  startedAt: string; // ISO date
  area: EventArea;
  bufferKm: number;
  url?: string;
};
