/**
 * npm run sim:reset -- --yes
 * Wipes the demo ledger (donations, claims + evidence, decisions, payouts, allocations, webhook events,
 * alert dedupe keys) and the documents in both Elastic indices,
 * so the scripted demo can run again. PayPal sandbox balances are NOT touched.
 * Refuses to run when NODE_ENV=production.
 */
import "../scripts/load-env";
import { db } from "../lib/db";
import { elasticConfigured } from "../lib/search/client";
import { clearIndices } from "../lib/search/claims";

export async function resetDemoData(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("sim:reset refuses to run in production");
  await db.$transaction([
    db.allocation.deleteMany(),
    db.payout.deleteMany(),
    db.decision.deleteMany(),
    db.claim.deleteMany(),
    db.donation.deleteMany(),
    db.webhookEvent.deleteMany(),
    db.alertSent.deleteMany(), // so review / ops alerts fire again in the next run
    db.trailEntry.deleteMany(), // the on-chain memos stay on devnet; only our queue rows go
  ]);
  // claim_evidence rows go with their claims (ON DELETE CASCADE). feed_cache and ai_cache are kept.
  if (elasticConfigured()) await clearIndices();
}

if (require.main === module) {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all demo rows. Re-run with: npm run sim:reset -- --yes");
    process.exit(1);
  }
  resetDemoData()
    .then(async () => {
      console.log("Demo data reset.");
      await db.$disconnect();
    })
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}
