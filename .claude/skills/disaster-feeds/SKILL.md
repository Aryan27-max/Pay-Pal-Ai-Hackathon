---
name: disaster-feeds
description: Use for the location signal — GDACS and USGS event feeds, event areas (polygon or radius), point-in-area tests, the simulated demo event, feed caching and the far-from-any-event hard rule.
---

# disaster-feeds

## Purpose

Location signal (weight 25): is the claimant's GPS inside an active disaster area? Real feeds and the
clearly labelled **simulated** demo event go through the **same** code path (`DisasterEvent` → `locate()`).

## Files it owns

- `lib/disasters/types.ts` — `DisasterEvent { id, source: "gdacs"|"usgs"|"simulated", type, name, region, startedAt, area, bufferKm }`
- `lib/disasters/geo.ts` — pure `pointInPolygon`, `distanceToArea`, `locate()`
- `lib/disasters/gdacs.ts`, `lib/disasters/usgs.ts` — fetch + parse (zod), cached
- `lib/disasters/index.ts` — `activeEvents()`, `checkLocation(point)`
- `simulators/fixtures/flood-zone.json` — the SIMULATED event (source `simulated`)
- `scripts/disasters-live.ts` — `npm run disasters:live` real-event lookup

## Env vars

`GDACS_FEED_URL` (kept for reference; the code uses the GDACS JSON API below), `USGS_FEED_URL`,
`SIMULATED_EVENT` (`on` | `off`; empty = on), `KERNEL_API_KEY` (see `kernel-browser`).

## APIs (checked 2026-11-07)

- **GDACS events:** `GET https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=FL;TC;EQ;WF;VO;DR`
  → GeoJSON FeatureCollection of **Points**. Properties: `eventtype`, `eventid`, `episodeid`, `name`,
  `alertlevel`, `iscurrent` (string "true"/"false"), `fromdate`, `todate` (no timezone), `country`,
  `url.geometry` (object field). Max 100 per page, newest `todate` first.
- **GDACS area:** `GET https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=&eventid=&episodeid=`
  → FeatureCollection: a centroid Point then `Polygon` rings (`[[[lon,lat],…]]`). Fetched only for events
  whose centroid is within 1,500 km of the claim.
- **USGS:** `USGS_FEED_URL` (significant_week). Points `[lon, lat, depth]`, `properties.mag`, `place`,
  `time` (ms), `url`. Updated every minute. Often empty (0 features on 2026-11-07).

## Rules (pure, in lib/scoring + lib/disasters/geo)

- An event is active if `todate` (GDACS) or `time` (USGS) is within `EVENT_ACTIVE_DAYS` (14).
- Area: GDACS polygons when present; otherwise a radius by type (EQ by magnitude: M≥7 → 150 km,
  M≥6 → 80 km, else 40 km; FL/TC default 100 km). Buffer = 10 km. Recorded in architecture.md §5.
- Signal: inside area → 1; within buffer → 0.5; otherwise 0.
- **Hard rule:** farther than `FAR_FROM_EVENT_KM` (100 km) from every active event → REJECTED
  (appealable), and no AI call is made.

## Caching

Feed responses go into Postgres `feed_cache` (key, body, fetched_at), TTL 15 min, so every workflow
instance shares one cache and a GDACS outage reuses the last good copy for up to 24 h.

## Gotchas

- GDACS `iscurrent` was "false" on every feature we saw; use dates, not that flag.
- GDACS dates have no timezone: treat as UTC.
- Never send exact GPS to any external service other than the official alert page lookup (rounded to 0.01°).

## Test

- `tests/disasters.test.ts`: point-in-polygon, distance-to-area, `locate()` with a simulated circle and a
  GDACS-shaped polygon fixture; the far-from-event rule.
- `npm run disasters:live`: fetches GDACS + USGS now, picks a real event, tests a point inside it.
