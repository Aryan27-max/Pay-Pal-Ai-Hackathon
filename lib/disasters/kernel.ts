import Kernel from "@onkernel/sdk";
import { chromium } from "playwright-core";
import { cached } from "@/lib/cache";
import { env } from "@/lib/env";

/**
 * Optional corroboration with a Kernel cloud browser (see .claude/skills/kernel-browser/SKILL.md).
 * Opens the official NWS point-forecast page for the ~1 km rounded claim point and reads the
 * "Hazardous Weather Conditions" links (showsigwx.php). It can only RAISE the location signal; it never
 * lowers it, never blocks scoring (hard timeout) and any failure means "feeds only".
 * Replay URLs are sensitive (Kernel docs): stored on the claim, shown on /admin only.
 */
/** Whole check incl. browser start + teardown. Measured live: ~10–13 s (create 1 s, replay 2 s, CDP 3 s, page 2 s). */
export const KERNEL_TIMEOUT_MS = 30_000;
const CACHE_MS = 30 * 60_000;

export type KernelCheck = {
  status: "active" | "none" | "failed" | "skipped";
  matched: string[]; // hazard products that corroborate this event type
  hazards: string[]; // every hazard product on the page
  pageUrl?: string;
  replayUrl?: string;
  cached?: boolean;
  error?: string;
};

const MATCHERS: Record<string, RegExp> = {
  flood: /flood/i,
  tropical_cyclone: /hurricane|tropical storm|storm surge|typhoon/i,
  wildfire: /red flag|fire/i,
};

/**
 * Pure (tested): hazard products from the page HTML. On forecast.weather.gov/MapClick.php each active product
 * is a link to showsigwx.php inside "Hazardous Weather Conditions" (absent when nothing is active).
 */
export function extractHazards(html: string): string[] {
  const out = [...html.matchAll(/<a[^>]+href="[^"]*showsigwx\.php[^"]*"[^>]*>([^<]+)<\/a>/gi)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
  return [...new Set(out.filter(Boolean))];
}

/** Pure (tested): which hazard products corroborate this event type. */
export function matchHazards(hazards: string[], eventType: string): string[] {
  const re = MATCHERS[eventType];
  return re ? hazards.filter((h) => re.test(h)) : [];
}

export const nwsPageUrl = (lat: number, lon: number) => `https://forecast.weather.gov/MapClick.php?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;

export function kernelEnabled(): boolean {
  const e = env();
  return Boolean(e.KERNEL_API_KEY) && e.KERNEL_CHECK !== "off";
}

/** NWS covers the US only; elsewhere the check is skipped. */
const inUsBox = (lat: number, lon: number) => lat > 17 && lat < 72 && lon > -180 && lon < -64;

async function runBrowser(pageUrl: string): Promise<{ hazards: string[]; replayUrl?: string }> {
  const kernel = new Kernel({ apiKey: env().KERNEL_API_KEY });
  const kb = await kernel.browsers.create({ timeout_seconds: 60 });
  let replayId: string | undefined;
  let replayUrl: string | undefined;
  try {
    try {
      const rep = await kernel.browsers.replays.start(kb.session_id);
      replayId = rep.replay_id;
      replayUrl = rep.replay_view_url ?? undefined;
    } catch {
      /* replays are a nice-to-have for the video */
    }
    const browser = await chromium.connectOverCDP(kb.cdp_ws_url);
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      // page.evaluate returns the DOM in ~0.5 s; page.content() took ~11 s on this page (measured).
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      return { hazards: extractHazards(html), replayUrl };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    if (replayId) await kernel.browsers.replays.stop(replayId, { id_or_name: kb.session_id }).catch(() => undefined);
    await kernel.browsers.deleteByID(kb.session_id).catch(() => undefined);
  }
}

/** Never throws. Cached per ~10 km cell + event type for 30 min (≈ 2 browser sessions an hour per area). */
export async function corroborateAlert(lat: number, lon: number, eventType: string, cellKey: string): Promise<KernelCheck> {
  if (!kernelEnabled()) return { status: "skipped", matched: [], hazards: [], error: "KERNEL_API_KEY not set or KERNEL_CHECK=off" };
  if (!inUsBox(lat, lon)) return { status: "skipped", matched: [], hazards: [], error: "outside NWS coverage" };
  const pageUrl = nwsPageUrl(lat, lon);
  const work = cached(`kernel:${cellKey}:${eventType}`, CACHE_MS, async () => {
    const r = await runBrowser(pageUrl);
    const matched = matchHazards(r.hazards, eventType);
    return { status: matched.length ? "active" : "none", matched, hazards: r.hazards, pageUrl, replayUrl: r.replayUrl } satisfies KernelCheck;
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`timed out after ${KERNEL_TIMEOUT_MS} ms`)), KERNEL_TIMEOUT_MS);
  });
  try {
    const r = await Promise.race([work, timeout]);
    return { ...r.value, cached: r.hit };
  } catch (e) {
    work.catch(() => undefined); // the browser cleanup still runs in the background
    return { status: "failed", matched: [], hazards: [], pageUrl, error: e instanceof Error ? e.message.slice(0, 160) : "error" };
  } finally {
    clearTimeout(timer);
  }
}
