/**
 * npm run test:e2e — reviewer flow end to end in a real browser (Playwright; uses your installed Chrome or
 * Edge, or Playwright's Chromium if you ran `npx playwright-core install chromium`). Needs the app on :3000.
 *  1. reset, donation wave 1 ($85, sandbox card) so an approval can actually pay
 *  2. two borderline fixture claims → IN_REVIEW
 *  3. browser: /review → sign in → Approve without a reason is refused → approve one with a reason,
 *     reject the other with a reason
 *  4. database: both reviewer decisions recorded with the reason, the approved claim got a payout,
 *     the rejected one did not; claim statuses updated
 * Screenshots: <os tmp>/relief-stream-e2e/review-*.png.
 */
import "./load-env";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { db } from "@/lib/db";
import { resetDemoData } from "../simulators/reset";
import { claimantEmails, FIXTURES, loadClaimFixtures } from "../simulators/lib";
import { runStream, WAVE_1 } from "../simulators/stream";

const BASE = process.env.SIM_BASE_URL || "http://localhost:3000";
// Outside the repo: files written inside a OneDrive-synced project can wake the Next dev watcher.
const OUT = path.join(os.tmpdir(), "relief-stream-e2e");
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function launch(): Promise<Browser> {
  for (const channel of ["chrome", "msedge", undefined] as const) {
    try {
      return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    } catch {
      /* try the next one */
    }
  }
  throw new Error("No browser found: install Chrome or Edge, or run `npx playwright-core install chromium`.");
}

async function submit(key: string): Promise<{ id: string; publicId: string }> {
  const f = loadClaimFixtures().find((x) => x.key === key)!;
  const form = new FormData();
  form.set("lat", String(f.lat));
  form.set("lon", String(f.lon));
  form.set("message", f.message);
  form.set("paypal_email", claimantEmails(false)[f.emailIndex!]!);
  form.set("photo", new Blob([new Uint8Array(fs.readFileSync(path.join(FIXTURES, "photos", f.photo)))], { type: "image/jpeg" }), f.photo);
  const r = (await (await fetch(`${BASE}/api/claims`, { method: "POST", body: form })).json()) as { claimPublicId: string; outcome: string };
  const row = await db.claim.findUniqueOrThrow({ where: { claimPublicId: r.claimPublicId }, select: { id: true, status: true } });
  console.log(`  submitted ${key}: ${r.outcome} (${r.claimPublicId})`);
  return { id: row.id, publicId: r.claimPublicId };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await resetDemoData();
  console.log("Setup");
  const w = await runStream(WAVE_1, "  Donation wave 1");
  check("wave 1 donations captured", w.results.every((d) => d.ok));
  const approveMe = await submit("borderline-no-damage");
  const rejectMe = await submit("borderline-outside-zone");

  // Dev mode compiles each route on first use, and a compile can reload the page mid-test: warm them first.
  const tok = { "x-reviewer-token": process.env.REVIEWER_ACCESS_TOKEN!, "Content-Type": "application/json" };
  await fetch(`${BASE}/api/review`, { headers: tok });
  await fetch(`${BASE}/api/review/00000000-0000-4000-8000-000000000000`, { method: "POST", headers: tok, body: JSON.stringify({ action: "reject", reason: "warm-up only" }) });
  await fetch(`${BASE}/review`);

  console.log("Browser");
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(45_000);
  // Warm-up: right after a dev-server restart Next can rebuild/reload a few times; wait until it settles.
  let navs = 0;
  page.on("framenavigated", (f) => void (f === page.mainFrame() && navs++));
  for (let i = 0; i < 20; i++) {
    const before = navs;
    await page.goto(`${BASE}/review`);
    await page.waitForTimeout(3000);
    if (navs - before <= 1) break;
  }
  await page.goto(`${BASE}/review?claim=${approveMe.publicId}`);
  await page.fill('input[name="t"]', process.env.REVIEWER_ACCESS_TOKEN!);
  await page.click("text=Open queue");
  await page.waitForSelector(`text=${approveMe.publicId}`);
  await page.waitForSelector(`text=${rejectMe.publicId}`);
  check("both claims are in the queue", true);
  await page.screenshot({ path: path.join(OUT, "review-queue.png"), fullPage: true });

  const card = (pid: string) => page.locator("div.rounded-lg", { hasText: pid }).first();
  await card(approveMe.publicId).locator("button", { hasText: "Approve" }).click();
  check("approve without a reason is refused", await page.isVisible("text=Write a reason"));

  await card(approveMe.publicId).locator("input").fill("Flood photo checked by hand; message matches the event.");
  await card(approveMe.publicId).locator("button", { hasText: "Approve" }).click();
  await page.waitForSelector("text=Decision recorded", { timeout: 90_000 });
  const msg1 = await page.locator("p.rounded.bg-slate-100").innerText();
  check("approve shows the outcome", /APPROVED/.test(msg1), msg1.slice(0, 120));

  await card(rejectMe.publicId).locator("input").fill("Address is outside the flood area; asked claimant for proof.");
  await card(rejectMe.publicId).locator("button", { hasText: "Reject" }).click();
  await page.waitForFunction(() => /REJECTED/.test(document.querySelector("p.rounded.bg-slate-100")?.textContent ?? ""), null, { timeout: 30_000 });
  check("reject shows the outcome", true);
  await page.screenshot({ path: path.join(OUT, "review-after.png"), fullPage: true });
  await browser.close();

  console.log("Database");
  const a = await db.claim.findUniqueOrThrow({ where: { id: approveMe.id }, include: { decisions: { orderBy: { createdAt: "asc" } }, payouts: true } });
  const r = await db.claim.findUniqueOrThrow({ where: { id: rejectMe.id }, include: { decisions: { orderBy: { createdAt: "asc" } }, payouts: true } });
  const ra = a.decisions.find((d) => d.actor !== "engine");
  const rr = r.decisions.find((d) => d.actor !== "engine");
  check("approval recorded with actor + reason", Boolean(ra && ra.outcome === "APPROVED" && /checked by hand/.test(ra.reason)), ra ? `${ra.actor.slice(0, 10)}… "${ra.reason.slice(0, 60)}"` : "missing");
  check("rejection recorded with actor + reason", Boolean(rr && rr.outcome === "REJECTED" && /outside the flood area/.test(rr.reason)));
  check("approved claim got a payout (amount fixed by code)", a.payouts.length === 1 && Number(a.payouts[0]!.amountUsd) === 50, `${a.status}, payout ${a.payouts[0]?.payoutBatchId ?? "-"} ${a.payouts[0]?.status ?? ""}`);
  check("rejected claim got no payout", r.payouts.length === 0 && r.status === "REJECTED");
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nReviewer flow passed end to end.");
  process.exitCode = failures ? 1 : 0;
})()
  .catch((e) => {
    console.error("e2e crashed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
