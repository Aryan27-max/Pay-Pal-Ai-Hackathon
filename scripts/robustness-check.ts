/**
 * npm run check:robustness — live integration proofs for Step 2 (local stack + running app on :3000):
 *  A. RACE: two claims with the same picture (original + resized copy, different SHA-256) posted at the
 *     same moment → exactly one is the original, the other is rejected as a near-duplicate.
 *  B. RECOVERY: a claim left in VERIFYING for 10 min (process "died") is re-verified by the recovery sweep
 *     and decided exactly once, even with two sweeps running at the same time; a stuck claim whose evidence
 *     is gone goes to IN_REVIEW (never rejected for our failure).
 * Uses placeholder emails (no payout can reach a real person) and fixture photos. Resets demo data first.
 */
import "./load-env";
import fs from "node:fs";
import sharp from "sharp";
import { db } from "@/lib/db";
import { claimPublicId, geoCell, sha256Hex } from "@/lib/privacy";
import { recoverStuckClaims } from "@/lib/claims/recovery";
import { verifyClaimInline } from "@/workflows/verify-claim";
import { resetDemoData } from "../simulators/reset";

const BASE = process.env.SIM_BASE_URL || "http://localhost:3000";
const P = "simulators/fixtures/photos/";
const MSG = "El martes el río Missouri inundó nuestra calle en St. Charles. El agua entró en la casa y perdimos los muebles y la ropa de los niños. Ahora estamos sacando el lodo y necesitamos ayuda para comida y productos de limpieza.";
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function post(photo: Buffer, email: string) {
  const f = new FormData();
  f.set("lat", "38.815");
  f.set("lon", "-90.405");
  f.set("message", MSG);
  f.set("paypal_email", email);
  f.set("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "p.jpg");
  const r = await fetch(`${BASE}/api/claims`, { method: "POST", body: f });
  return (await r.json()) as { claimPublicId: string; outcome: string; reason: string; detail?: { photo?: { nearestClaim?: string; cosine?: number; dhashDistance?: number; nearRule?: string } } };
}

(async () => {
  await resetDemoData();
  console.log("A. Race: same picture submitted twice at the same moment");
  const g2 = fs.readFileSync(P + "genuine-2.jpg");
  const resized = await sharp(g2).resize(700).jpeg({ quality: 60 }).toBuffer();
  const [a, b] = await Promise.all([post(g2, "race.a@example.com"), post(resized, "race.b@example.com")]);
  const dups = [a, b].filter((x) => /near-duplicate/.test(x.reason ?? ""));
  check("exactly one of the two is rejected as a near-duplicate", dups.length === 1, `${a.outcome} / ${b.outcome}`);
  if (dups[0]) console.log(`       ${dups[0].claimPublicId}: ${dups[0].reason}`);

  console.log("B. Recovery of a claim stuck in VERIFYING");
  const g3 = fs.readFileSync(P + "genuine-3.jpg");
  const salt = process.env.CLAIM_ID_SALT!;
  const mk = async (email: string, withEvidence: boolean) =>
    db.claim.create({
      data: {
        paypalEmail: email,
        lat: 38.77,
        lon: -90.415,
        geoCell: geoCell(38.77, -90.415),
        photoSha256: withEvidence ? sha256Hex(g3) : sha256Hex(`lost-${email}`),
        messageText: "Flood water from the Missouri is still standing in our yard in St. Charles County and the crawl space is full. The power has been out since Wednesday and the furnace was under water. We need help to buy a heater and food until the water goes down.",
        status: "VERIFYING",
        claimPublicId: claimPublicId(salt, email, 0),
        ...(withEvidence ? { evidence: { create: { photo: g3, photoMime: "image/jpeg" } } } : {}),
      },
    });
  const stuck = await mk("stuck.with.evidence@example.com", true);
  const lost = await mk("stuck.no.evidence@example.com", false);
  await db.$executeRaw`UPDATE claim SET updated_at = now() - interval '10 minutes' WHERE id IN (${stuck.id}::uuid, ${lost.id}::uuid)`;
  const deps = { reverify: (id: string) => verifyClaimInline(id), payout: async () => undefined };
  const [r1, r2] = await Promise.all([recoverStuckClaims(deps), recoverStuckClaims(deps)]);
  const decisions = await db.decision.count({ where: { claimId: stuck.id } });
  const after = await db.claim.findUniqueOrThrow({ where: { id: stuck.id }, select: { status: true } });
  check("stuck claim re-verified and decided exactly once (two sweeps raced)", decisions === 1 && after.status !== "VERIFYING", `status ${after.status}, ${decisions} decision(s); sweeps re-verified ${r1.reverified.length}+${r2.reverified.length}`);
  const lostAfter = await db.claim.findUniqueOrThrow({ where: { id: lost.id }, include: { decisions: true } });
  check("stuck claim without evidence goes to IN_REVIEW (not rejected)", lostAfter.status === "IN_REVIEW" && lostAfter.decisions.length === 1, lostAfter.decisions[0]?.reason ?? "");
  const again = await recoverStuckClaims(deps);
  check("a second sweep finds nothing to do (idempotent)", again.reverified.length + again.toReview.length === 0);

  await resetDemoData();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll robustness checks passed.");
  process.exitCode = failures ? 1 : 0;
})()
  .catch((e) => {
    console.error("robustness check crashed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
