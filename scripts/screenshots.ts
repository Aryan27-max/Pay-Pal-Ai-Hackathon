/**
 * npm run screenshots — captures the README images into docs/screenshots (needs the app on :3000 with demo data,
 * i.e. run `npm run demo` first; uses your installed Chrome or Edge). The reviewer token is put in sessionStorage by
 * the script and never printed or drawn on screen.
 */
import fs from "node:fs";
import { chromium, type Browser } from "playwright-core";

const BASE = process.env.APP_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const OUT = "docs/screenshots";

async function launch(): Promise<Browser> {
  for (const channel of ["chrome", "msedge", undefined] as const) {
    try {
      return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    } catch {}
  }
  throw new Error("No browser found: install Chrome or Edge.");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // a donor whose money has reached a claim (their receipt names it), so the receipt shows the whole chain
  const ids = [...new Set((await (await fetch(`${BASE}/api/trail`)).text()).match(/d_[0-9a-f]{20}/g) ?? [])];
  let donorId: string | undefined;
  for (const id of ids) if ((await (await fetch(`${BASE}/api/receipts/${id}`)).text()).includes('"c_')) (donorId ??= id);
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((t) => sessionStorage.setItem("reviewer-token", t as string), process.env.REVIEWER_ACCESS_TOKEN ?? "");
  const page = await ctx.newPage();
  const shots: [string, string, boolean][] = [
    ["01-stream", "/stream", false],
    ["02-dashboard", "/dashboard", true],
    ["04-reviewer", "/review", false],
    ["05-admin", "/admin", true],
  ];
  if (donorId) shots.splice(2, 0, ["03-receipt", `/receipt/${donorId}`, true]);
  for (const [name, path, full] of shots) {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120_000 }).catch(() => {});
    await page.waitForFunction(() => !document.body.innerText.includes("loading...") && !/\$0\.00 of your/.test(document.body.innerText), null, { timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (full) await page.setViewportSize({ width: 1360, height: 1250 }); // tall viewport instead of fullPage (the grid repaints)
    await page.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled", caret: "hide", timeout: 120_000 });
    if (full) await page.setViewportSize({ width: 1360, height: 900 });
    console.log(`saved ${OUT}/${name}.png  (${path.replace(/d_[0-9a-f]+/, "d_…")})`);
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
