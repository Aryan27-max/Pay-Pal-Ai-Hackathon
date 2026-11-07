---
name: kernel-browser
description: Use for pages with no usable API — the Kernel cloud browser (@onkernel/sdk + playwright-core over CDP) that opens an official alert page, extracts whether an alert is active, and records a replay link for the demo.
---

# kernel-browser

## Purpose

Optional corroboration for the location signal. One Kernel browser opens the official NWS point-forecast
page for the claim area and reads the "Hazardous Weather Conditions" section. It can only **raise**
location (feeds said 0 or 0.5, the page shows an active flood alert → 1). It never lowers it, never blocks
scoring, and failure means "feeds only".

## Files it owns

- `lib/disasters/kernel.ts` — `corroborateAlert(point, eventType)` → `{ status, alerts[], replayUrl?, liveViewUrl? }`
- Claim columns `kernel_replay_url`, `kernel_status` (private; shown on /admin only)

## Env vars

`KERNEL_API_KEY` (SDK reads it by default), `KERNEL_CHECK` (`on` | `off`; empty = on when the key is set).

## API (kernel.sh docs + the SDK's .d.ts, checked 2026-11-07)

```ts
import Kernel from "@onkernel/sdk";
import { chromium } from "playwright-core";
const kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
const kb = await kernel.browsers.create({ timeout_seconds: 60 });   // headful: live view + replays
const replay = await kernel.browsers.replays.start(kb.session_id);  // → { replay_id, replay_view_url }
const browser = await chromium.connectOverCDP(kb.cdp_ws_url);
const page = browser.contexts()[0].pages()[0];
// … page.goto, read text …
await kernel.browsers.replays.stop(replay.replay_id, { id_or_name: kb.session_id }); // SDK 0.142 (docs show `{ id }`)
await kernel.browsers.deleteByID(kb.session_id);                     // always, in finally
```
Read-only auth check: `GET https://api.onkernel.com/browsers?limit=1` with `Authorization: Bearer <key>`.

## Page and extraction

- URL: `https://forecast.weather.gov/MapClick.php?lat=<lat 2dp>&lon=<lon 2dp>` (official NWS page,
  server-rendered). The section "Hazardous Weather Conditions" lists active products, e.g.
  "Freeze Warning until …". Absent section = no active hazard.
- Match product names to the event type (flood: "Flood Warning", "Flash Flood Warning", "Flood Watch",
  "Flood Advisory"; other hazards are recorded but don't corroborate a flood).
- NWS also has a JSON alerts API (api.weather.gov). We use the page because the demo shows a browser agent
  reading an official human page; state this honestly in the README.

## Limits

- Strict timeout: 20 s for the whole check (`Promise.race`); the session's own `timeout_seconds` is 60.
- Cache per (rounded point, event type) in `feed_cache` for 30 min: at most ~2 browser sessions an hour.
- Developer plan: free + $5 usage credit/month, 5 concurrent browsers, replays kept 1 day.
  Headful costs ~$0.00013/s, so a 15 s check is ~$0.002.
- Replay URLs are sensitive (docs): store them on the claim, show them on /admin only, never public.

## Gotchas

- `browser_live_view_url` exists only for headful browsers and only while the session lives; the replay
  URL is what survives for the video.
- Always `deleteByID` in `finally`: standby browsers still count against the concurrency limit.

## Test

- `tests/kernel.test.ts`: the extractor on saved HTML text (active flood, freeze only, none).
- Live: `npx tsx scripts/kernel-smoke.ts` runs one check for St. Charles and prints status + whether a
  replay URL came back (not the URL).
