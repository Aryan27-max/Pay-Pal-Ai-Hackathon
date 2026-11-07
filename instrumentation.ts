/**
 * Next.js instrumentation: runs once when a server process starts (Node runtime only).
 * Starts the recovery sweep (lib/claims/recovery.ts): on startup and every 2 minutes it re-runs claims stuck
 * in RECEIVED/VERIFYING for more than 5 minutes and restarts payouts for APPROVED claims that never got one.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startRecoveryLoop } = await import("@/lib/claims/recovery");
  const { startTrailWorker } = await import("@/lib/trail/worker");
  startTrailWorker(); // public Solana trail: sends queued entries every 15 s (and right after each new entry)
  startRecoveryLoop(async () => {
    const { verifyClaimInline } = await import("@/workflows/verify-claim");
    const { sendPayout } = await import("@/workflows/send-payout");
    return {
      reverify: async (id: string) => {
        const r = await verifyClaimInline(id);
        if (r.decision.outcome === "APPROVED" && !r.alreadyDecided) await sendPayout(id);
        return r;
      },
      payout: (id: string) => sendPayout(id),
    };
  });
}
