/**
 * npx tsx scripts/kernel-smoke.ts [lat lon] — one Kernel browser check (default: St. Charles, MO).
 * Prints the status, the hazard products found and whether a replay URL came back (never the URL:
 * replay links are sensitive). Bypasses the 30-min cache with a unique cell key.
 */
import "./load-env";
import { corroborateAlert } from "@/lib/disasters/kernel";
import { db } from "@/lib/db";

(async () => {
  const lat = Number(process.argv[2] ?? 38.79);
  const lon = Number(process.argv[3] ?? -90.5);
  const t = Date.now();
  const r = await corroborateAlert(lat, lon, "flood", `smoke-${t}`);
  console.log(`status ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  console.log(`hazards on the page: ${r.hazards.length ? r.hazards.join(", ") : "none"}`);
  console.log(`flood corroboration: ${r.matched.length ? r.matched.join(", ") : "none"}`);
  console.log(`replay URL returned: ${r.replayUrl ? "yes" : "no"}${r.error ? ` | error: ${r.error}` : ""}`);
  await db.feedCache.deleteMany({ where: { key: { startsWith: "kernel:smoke-" } } });
})()
  .catch((e) => {
    console.error("kernel smoke failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
