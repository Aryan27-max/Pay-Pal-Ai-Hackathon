/**
 * npm run sim:reset -- --yes
 * Wipes the local demo ledger (donations, claims, decisions, payouts, allocations, webhook events)
 * so the scripted demo can run again. PayPal sandbox balances are NOT touched.
 * Refuses to run when NODE_ENV=production.
 */
import "../scripts/load-env";
import { db } from "../lib/db";

export async function resetDemoData(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("sim:reset refuses to run in production");
  await db.$transaction([
    db.allocation.deleteMany(),
    db.payout.deleteMany(),
    db.decision.deleteMany(),
    db.claim.deleteMany(),
    db.donation.deleteMany(),
    db.webhookEvent.deleteMany(),
  ]);
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
