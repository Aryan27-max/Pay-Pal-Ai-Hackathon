/**
 * npm run sim:stream — scripted sandbox donations from simulated stream viewers.
 * Calls POST /api/sim/stream, which pays with PayPal's documented sandbox test Visa (no popup).
 * Requires "Advanced Credit and Debit Card Payments" on the (US) sandbox app.
 */
import { baseUrl, operatorToken, pad, waitForServer } from "./lib";

export type ScriptedDonation = { name: string; amountUsd: number };

/** Wave 1 ($85) fills the pool for one $50 packet; wave 2 ($215) releases the claims left WAITING_FUNDS. */
export const WAVE_1: ScriptedDonation[] = [
  { name: "Ron", amountUsd: 10 },
  { name: "Rahul", amountUsd: 25 },
  { name: "Mira", amountUsd: 50 },
];
export const WAVE_2: ScriptedDonation[] = [
  { name: "Kofi", amountUsd: 40 },
  { name: "Lena", amountUsd: 75 },
  { name: "Sam", amountUsd: 100 },
];
export const SCRIPTED_DONATIONS = [...WAVE_1, ...WAVE_2];

export type SimResult = { name: string; ok: boolean; orderId?: string; captureId?: string; amountUsd?: number; donorPublicId?: string | null; error?: string };
export type Released = { claimPublicId: string; kind: string; senderBatchId?: string; payoutBatchId?: string; itemStatus?: string | null; error?: string };

export async function runStream(donations: ScriptedDonation[] = SCRIPTED_DONATIONS, label = "Stream donations"): Promise<{ results: SimResult[]; released: Released[] }> {
  await waitForServer();
  const res = await fetch(`${baseUrl()}/api/sim/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-reviewer-token": operatorToken() },
    body: JSON.stringify({ streamId: "main", donations }),
  });
  const body = (await res.json()) as { results?: SimResult[]; released?: Released[]; error?: string };
  if (!res.ok || !body.results) throw new Error(`sim/stream failed: HTTP ${res.status} ${body.error ?? ""}`);
  console.log(`\n${label} (PayPal sandbox)`);
  for (const r of body.results) {
    console.log(
      `  ${r.ok ? "OK  " : "FAIL"} ${pad(r.name, 6)} $${pad(r.amountUsd ?? "", 6)} order ${pad(r.orderId ?? "-", 18)} capture ${pad(r.captureId ?? "-", 18)} ${r.error ?? r.donorPublicId ?? ""}`,
    );
  }
  const released = body.released ?? [];
  if (released.length) {
    console.log("  Released from WAITING_FUNDS (oldest first):");
    for (const r of released) {
      console.log(`    ${pad(r.claimPublicId, 23)} ${pad(r.kind, 13)} ${r.payoutBatchId ? `payout_batch_id ${r.payoutBatchId} ${r.itemStatus ?? ""}` : r.error ?? ""}`);
    }
  }
  return { results: body.results, released };
}

if (require.main === module) {
  runStream()
    .then((r) => process.exit(r.results.every((x) => x.ok) ? 0 : 1))
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}
