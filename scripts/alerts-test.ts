/**
 * npm run alerts:test -- review|ops — send ONE sample alert to the matching Zapier Catch Hook, so you can
 * finish the Zap setup ("Test trigger" in Zapier). Sample data only: no real claim, no PII.
 */
import "./load-env";
import { db } from "@/lib/db";
import { sendOpsAlert, sendReviewAlert } from "@/lib/alerts";

(async () => {
  const which = process.argv[2] ?? "review";
  const key = `test-${Date.now()}`;
  const r =
    which === "ops"
      ? await sendOpsAlert({ kind: "payout_failed", severity: "high", summary: "TEST: payout for c_00000000000000000000 ended UNCLAIMED", claimPublicId: "c_00000000000000000000", detail: "Sample alert from npm run alerts:test" }, key)
      : await sendReviewAlert({ claimPublicId: `c_${"0".repeat(20)}`, score: 61, geoCell: "38.75,-90.45", redFlags: ["TEST: sample red flag"], aiExplanation: "Sample alert from npm run alerts:test.", reason: "score 61 in review band 50–74" });
  console.log(`${which} alert: ${r}`);
  await db.alertSent.deleteMany({ where: { key: { contains: "test-" } } });
  await db.alertSent.deleteMany({ where: { key: `review:c_${"0".repeat(20)}` } });
})()
  .catch((e) => {
    console.error("alerts:test failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
