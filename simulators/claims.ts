/**
 * npm run sim:claims [-- --placeholder]
 * Fires the 7 fixture claims (3 genuine, 2 borderline, 2 fakes) at POST /api/claims and
 * checks each outcome against the fixture's `expect`.
 */
import fs from "node:fs";
import path from "node:path";
import { baseUrl, claimantEmails, FIXTURES, loadClaimFixtures, pad, waitForServer, who } from "./lib";

export type ClaimRun = {
  key: string;
  kind: string;
  expect: string;
  outcome: string;
  status: string;
  score: number | null;
  claimPublicId: string;
  payout: { kind: string; senderBatchId?: string; payoutBatchId?: string; itemStatus?: string | null } | null;
  explanation: string;
  ai: {
    provider: string | null;
    model: string | null;
    cached: boolean;
    calls: { gemini: number; groq: number };
    scores: { photo_matches_disaster: number; photo_ai_generated_risk: number; message_consistency: number } | null;
  } | null;
  signals: Record<string, number> | null;
  ok: boolean;
};

export async function runClaims(opts: { placeholder: boolean }): Promise<ClaimRun[]> {
  const emails = claimantEmails(opts.placeholder);
  await waitForServer();
  const runs: ClaimRun[] = [];
  console.log(`\nClaims → ${baseUrl()}/api/claims${opts.placeholder ? "  (placeholder emails: payouts end UNCLAIMED)" : ""}`);
  for (const f of loadClaimFixtures()) {
    const email = emails[f.emailIndex];
    if (!email) throw new Error(`fixture ${f.key}: no email at index ${f.emailIndex}`);
    const form = new FormData();
    form.set("lat", String(f.lat));
    form.set("lon", String(f.lon));
    form.set("message", f.message);
    form.set("paypal_email", email);
    const bytes = fs.readFileSync(path.join(FIXTURES, "photos", f.photo));
    form.set("photo", new Blob([bytes], { type: "image/jpeg" }), f.photo);

    const t0 = Date.now();
    const res = await fetch(`${baseUrl()}/api/claims`, { method: "POST", body: form });
    const body = (await res.json()) as Partial<ClaimRun> & { reason?: string; error?: string };
    const outcome = body.outcome ?? `HTTP ${res.status} ${body.error ?? ""}`;
    const run: ClaimRun = {
      key: f.key,
      kind: f.kind,
      expect: f.expect,
      outcome,
      status: body.status ?? "-",
      score: body.score ?? null,
      claimPublicId: body.claimPublicId ?? "-",
      payout: body.payout ?? null,
      explanation: body.explanation ?? "",
      ai: body.ai ?? null,
      signals: (body.signals as Record<string, number> | undefined) ?? null,
      ok: outcome === f.expect,
    };
    runs.push(run);
    const pay = run.payout?.payoutBatchId ? `payout ${run.payout.payoutBatchId} ${run.payout.itemStatus ?? ""}` : run.payout?.kind ?? "";
    console.log(
      `  ${run.ok ? "OK  " : "MISS"} ${pad(f.key, 24)} ${pad(who(f.emailIndex), 11)} score ${pad(run.score ?? "-", 4)} ${pad(outcome, 10)} ${pad(run.status, 15)} ${pad(run.claimPublicId, 23)} ${pay}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
    const a = run.ai;
    const sc = a?.scores;
    const sg = run.signals;
    const fx = (n: number | undefined) => (typeof n === "number" ? n.toFixed(2) : "–");
    console.log(
      `       AI ${a?.provider ? `${a.provider}/${a.model}${a.cached ? " (demo cache)" : ""}` : "none"}  calls gemini=${a?.calls.gemini ?? 0} groq=${a?.calls.groq ?? 0}` +
        (sc ? `  photo_matches=${fx(sc.photo_matches_disaster)} ai_risk=${fx(sc.photo_ai_generated_risk)} message=${fx(sc.message_consistency)}` : "") +
        (sg ? `  | signals photo=${fx(sg.photo)} loc=${fx(sg.location)} msg=${fx(sg.message)} uniq=${fx(sg.uniqueness)} vouch=${fx(sg.vouching)}` : ""),
    );
    if (!run.ok || f.kind !== "genuine") console.log(`       ↳ ${run.explanation.slice(0, 220)}`);
  }
  return runs;
}

if (require.main === module) {
  runClaims({ placeholder: process.argv.includes("--placeholder") })
    .then((r) => process.exit(r.every((x) => x.ok) ? 0 : 1))
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}
