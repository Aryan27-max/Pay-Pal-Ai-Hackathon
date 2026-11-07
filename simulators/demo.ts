/**
 * npm run sim:demo [-- --runs 3] [-- --placeholder]
 * Full scripted loop, per run:
 *   reset → donation wave 1 ($85) → 11 claims (3 genuine, 2 borderline, 6 fakes) → donation wave 2 ($215)
 *   → settle payouts → checks (every fake must be stopped by the RIGHT check).
 * Wave 1 covers one $50 packet, so genuine-2 and genuine-3 park in WAITING_FUNDS; wave 2 must
 * release them automatically, oldest first. Prints the real PayPal order / capture / payout batch
 * ids and the FIFO allocations. Exits non-zero if any run misses a check.
 */
import { baseUrl, operatorToken, pad } from "./lib";
import { resetDemoData } from "./reset";
import { runStream, WAVE_1, WAVE_2, type SimResult } from "./stream";
import { runClaims } from "./claims";
import { db } from "../lib/db";

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? Number(process.argv[i + 1]) : def;
  return Number.isFinite(v) && v > 0 ? v : def;
}

const IN_FLIGHT = ["CREATED", "PENDING", "PROCESSING", "UNKNOWN"];
const aiCallsByRun: Array<{ run: number; gemini: number; groq: number; cached: number; whisper: number; kernel: number }> = [];

/** Re-poll PayPal until no payout is in flight and no claim is still waiting to be paid (or the timeout passes). */
async function settleAll(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await fetch(`${baseUrl()}/api/payouts/sync`, { method: "POST", headers: { "x-reviewer-token": operatorToken() } });
    const open = await db.payout.count({ where: { status: { in: IN_FLIGHT } } });
    // With Render Workflows the wave-2 release runs as a task, so its payouts may not exist yet.
    const waiting = await db.claim.count({ where: { status: { in: ["WAITING_FUNDS", "APPROVED", "PAYOUT_PENDING"] } } });
    if ((!open && !waiting) || Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

async function oneRun(n: number, placeholder: boolean): Promise<boolean> {
  console.log(`\n================ Demo run ${n} ================`);
  await resetDemoData();
  const checks: [string, boolean][] = [];

  const w1 = await runStream(WAVE_1, "Donation wave 1");
  if (!w1.results.every((d) => d.ok)) {
    console.log("A wave 1 donation failed; cannot continue this run.");
    return false;
  }
  const claims = await runClaims({ placeholder });
  // An outcome only counts if a real AI call (Gemini or the Groq fallback) or the demo cache
  // assessed the claim: an AI failure also lands in IN_REVIEW and must not pass for "borderline".
  const aiFailed = await db.claim.findMany({ where: { aiExplanation: { startsWith: "AI check failed" } }, select: { claimPublicId: true, aiExplanation: true } });
  for (const c of aiFailed) console.log(`  AI FAILED ${c.claimPublicId}: ${c.aiExplanation?.slice(0, 300)}`);
  const assessed = claims.filter((c) => c.detail?.ai?.skipped === false);
  checks.push(["every claim that needed the AI got a real AI call or the demo cache", aiFailed.length === 0 && assessed.every((c) => Boolean(c.ai?.provider))]);
  const calls = claims.reduce((s, c) => ({ gemini: s.gemini + (c.ai?.calls.gemini ?? 0), groq: s.groq + (c.ai?.calls.groq ?? 0) }), { gemini: 0, groq: 0 });
  const cached = claims.filter((c) => c.ai?.cached).length;
  const whisper = claims.filter((c) => c.voice === "sent").length;
  const kernel = claims.filter((c) => ["active", "none"].includes(c.detail?.location?.kernel?.status ?? "") && !c.detail?.location?.kernel?.cached).length;
  const byProvider = assessed.map((c) => `${c.key}=${c.ai?.provider ?? "none"}${c.ai?.cached ? "(cache)" : ""}`).join(", ");
  aiCallsByRun.push({ run: n, ...calls, cached, whisper, kernel });
  console.log(`\nAI usage this run: gemini calls=${calls.gemini}, groq calls=${calls.groq}, demo-cache hits=${cached}, whisper transcriptions=${whisper}, kernel browser sessions=${kernel}  [${byProvider}]`);
  const fallbacks = claims.filter((c) => c.voice === "fallback-text").map((c) => c.key);
  if (fallbacks.length) console.log(`  note: voice clip not recorded yet for ${fallbacks.join(", ")}: sent the fallback text instead (see simulators/fixtures/audio/README.md)`);
  const w2 = await runStream(WAVE_2, "Donation wave 2");
  await settleAll();

  const donors: SimResult[] = [...w1.results, ...w2.results];
  const nameOf = new Map(donors.map((d) => [d.donorPublicId ?? "", d.name]));
  const genuine = claims.filter((c) => c.kind === "genuine");
  const [g1, g2, g3] = genuine;

  checks.push(["all 6 donations captured (COMPLETED)", donors.length === 6 && donors.every((d) => d.ok)]);
  checks.push(["all 3 genuine claims APPROVED", genuine.length === 3 && genuine.every((c) => c.outcome === "APPROVED")]);
  checks.push(["borderline claims go to IN_REVIEW", claims.filter((c) => c.kind === "borderline").every((c) => c.outcome === "IN_REVIEW")]);
  for (const f of claims.filter((c) => c.kind === "fake")) {
    checks.push([`fake ${f.key}: ${f.expect.join("/")} and caught by ${f.expectCaughtBy}`, f.ok]);
  }
  checks.push(["genuine-1 paid from wave 1; genuine-2/3 parked in WAITING_FUNDS", Boolean(g1?.payout?.senderBatchId) && g2?.status === "WAITING_FUNDS" && g3?.status === "WAITING_FUNDS"]);
  // Release order from the ledger itself (works for inline and Render Workflows releases).
  const created = await db.payout.findMany({ orderBy: { createdAt: "asc" }, select: { claim: { select: { claimPublicId: true } } } });
  checks.push(["wave 2 auto-released WAITING_FUNDS claims oldest first", JSON.stringify(created.map((p) => p.claim.claimPublicId)) === JSON.stringify([g1?.claimPublicId, g2?.claimPublicId, g3?.claimPublicId])]);
  void w2;

  const payouts = await db.payout.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      claim: { select: { claimPublicId: true, status: true } },
      allocations: { include: { donation: { select: { donorPublicId: true, paypalCaptureId: true, createdAt: true } } } },
    },
  });
  const wantStatus = placeholder ? ["SUCCESS", "UNCLAIMED"] : ["SUCCESS"];
  checks.push([`3 payouts, all ${wantStatus.join("/")}`, payouts.length === 3 && payouts.every((p) => wantStatus.includes(p.status))]);
  const paid = payouts.filter((p) => p.status === "SUCCESS");
  const cents = (v: unknown) => Math.round(Number(v) * 100);
  checks.push(["every SUCCESS payout is fully allocated", paid.every((p) => p.allocations.reduce((s, a) => s + cents(a.amountUsd), 0) === cents(p.amountUsd))]);
  // FIFO: walking payouts in order, allocations must never take from a newer donation before an older one is used up.
  const allocOrder = paid.flatMap((p) => [...p.allocations].sort((a, b) => a.donation.createdAt.getTime() - b.donation.createdAt.getTime()).map((a) => a.donation.createdAt.getTime()));
  checks.push(["allocations follow donation order (FIFO)", allocOrder.every((t, i) => i === 0 || t >= allocOrder[i - 1]!)]);

  console.log("\nPayouts (final)");
  for (const p of payouts) {
    console.log(
      `  ${pad(p.claim.claimPublicId, 23)} $${Number(p.amountUsd).toFixed(2)}  ${pad(p.status, 9)} claim ${pad(p.claim.status, 14)} sender_batch_id ${pad(p.senderBatchId, 34)} payout_batch_id ${p.payoutBatchId ?? "-"}${p.error ? `  reason: ${p.error}` : ""}`,
    );
  }
  console.log("\nFIFO allocations (donor → claim)");
  for (const p of paid) {
    for (const a of [...p.allocations].sort((x, y) => x.donation.createdAt.getTime() - y.donation.createdAt.getTime())) {
      console.log(`  ${pad(nameOf.get(a.donation.donorPublicId) ?? a.donation.donorPublicId, 6)} capture ${pad(a.donation.paypalCaptureId, 18)} $${pad(Number(a.amountUsd).toFixed(2), 6)} → ${p.claim.claimPublicId} (payout_batch_id ${p.payoutBatchId})`);
    }
  }
  console.log("\nPer-claim summary (signals 0–1; total = weighted score)");
  console.log(`  ${pad("claim", 25)} ${pad("photo", 5)} ${pad("loc", 5)} ${pad("msg", 5)} ${pad("uniq", 5)} ${pad("vouch", 5)} ${pad("total", 5)} ${pad("decision", 10)} ${pad("caught by", 32)} payout_batch_id`);
  const f2 = (v: number | null | undefined) => (typeof v === "number" ? v.toFixed(2) : "–");
  const finalPayout = new Map(payouts.map((p) => [p.claim.claimPublicId, p]));
  for (const c of claims) {
    const s = c.signals ?? {};
    const p = finalPayout.get(c.claimPublicId);
    console.log(`  ${pad(c.key, 25)} ${pad(f2(s.photo), 5)} ${pad(f2(s.location), 5)} ${pad(f2(s.message), 5)} ${pad(f2(s.uniqueness), 5)} ${pad(f2(s.vouching), 5)} ${pad(c.score ?? "–", 5)} ${pad(c.outcome, 10)} ${pad(c.caughtBy ?? "–", 32)} ${p?.payoutBatchId ?? "–"}${p ? ` (${p.status})` : ""}`);
  }
  console.log("\nChecks");
  for (const [name, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`);
  return checks.every(([, ok]) => ok);
}

async function main() {
  const runs = arg("--runs", 1);
  const placeholder = process.argv.includes("--placeholder");
  let passed = 0;
  for (let i = 1; i <= runs; i++) if (await oneRun(i, placeholder)) passed++;
  console.log("\nAI calls per run");
  for (const r of aiCallsByRun) console.log(`  run ${r.run}: gemini=${r.gemini} groq=${r.groq} demo-cache hits=${r.cached} whisper=${r.whisper} kernel sessions=${r.kernel}`);
  console.log(`\nDemo: ${passed}/${runs} runs passed.`);
  await db.$disconnect();
  process.exit(passed === runs ? 0 : 1);
}

main().catch(async (e) => {
  console.error((e as Error).message);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
