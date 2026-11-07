/**
 * npm run sim:claims [-- --placeholder]
 * Fires the fixture claims (3 genuine, 2 borderline, 6 fakes) at POST /api/claims, including voice
 * notes, and checks each outcome AND, for fakes, which check caught it.
 * Inline server: the report comes back at once (201). Render Workflows: 202, then the report is polled
 * from GET /api/claims/:publicId?detail=1 (reviewer token).
 */
import fs from "node:fs";
import path from "node:path";
import { baseUrl, claimantEmails, FIXTURES, loadClaimFixtures, operatorToken, pad, resolveAudio, waitForServer, who, type ClaimFixture } from "./lib";

type Detail = {
  location?: { eventName?: string; eventSource?: string; far?: boolean; distanceOutsideKm?: number | null; confirmedBy?: string; kernel?: { status?: string; cached?: boolean; matched?: string[]; hazards?: string[] } };
  photo?: { exif?: string; cosine?: number | null; nearestClaim?: string | null; nearDuplicate?: boolean; unavailable?: boolean };
  message?: { voice?: boolean; transcribed?: boolean; language?: string | null; error?: string };
  uniqueness?: { duplicateEmail?: boolean; duplicatePhoto?: boolean; nearDuplicatePhoto?: boolean };
  vouching?: { nearbyVerified?: number };
  ai?: { skipped?: boolean; valid?: boolean };
};

type Report = {
  claimPublicId: string;
  status: string;
  outcome: string | null;
  score: number | null;
  reason: string | null;
  signals: Record<string, number | null>;
  detail: Detail | null;
  explanation: string;
  ai: { provider: string | null; model: string | null; cached: boolean; calls: { gemini: number; groq: number }; scores: { photo_matches_disaster: number; photo_ai_generated_risk: number; message_consistency: number } | null; redFlags: string[] };
  payout: { senderBatchId: string; payoutBatchId: string | null; status: string; amountUsd: string } | null;
};

export type ClaimRun = {
  key: string;
  kind: string;
  expect: string[];
  expectCaughtBy: string | null;
  caughtBy: string | null;
  outcome: string;
  status: string;
  score: number | null;
  reason: string;
  claimPublicId: string;
  signals: Record<string, number | null> | null;
  detail: Detail | null;
  ai: Report["ai"] | null;
  payout: Report["payout"];
  voice: "sent" | "fallback-text" | "none";
  explanation: string;
  ok: boolean;
};

/** Which check stopped a claim, derived from the stored evidence (the same order as lib/scoring's hard rules). */
export function caughtBy(r: Pick<Report, "outcome" | "signals" | "detail" | "ai">): string | null {
  const d = r.detail ?? {};
  if (d.uniqueness?.duplicateEmail) return "uniqueness:paypal_account";
  if (d.uniqueness?.duplicatePhoto) return "uniqueness:photo_hash";
  if (d.uniqueness?.nearDuplicatePhoto) return "uniqueness:clip_near_duplicate";
  if (d.location?.far) return "location:far_from_event";
  if (r.outcome === "APPROVED") return null;
  if ((r.ai?.scores?.photo_ai_generated_risk ?? 0) >= 0.8) return "photo:ai_generated";
  if ((r.signals.message ?? 1) < 0.3) return "message:contradicts_event";
  if ((r.signals.photo ?? 1) < 0.3) return "photo:weak";
  if ((r.signals.location ?? 1) < 1) return "location:outside_area";
  return "score";
}

const DONE = (s: string, outcome: string | null) =>
  !["RECEIVED", "VERIFYING"].includes(s) && !(outcome === "APPROVED" && ["APPROVED", "PAYOUT_PENDING"].includes(s));

async function pollReport(publicId: string, timeoutMs = 300_000): Promise<Report> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await fetch(`${baseUrl()}/api/claims/${publicId}?detail=1`, { headers: { "x-reviewer-token": operatorToken() } });
    if (r.ok) {
      const rep = (await r.json()) as Report;
      if (DONE(rep.status, rep.outcome) || Date.now() > deadline) return rep;
    } else if (Date.now() > deadline) throw new Error(`poll ${publicId}: HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 2_000));
  }
}

function emailFor(f: ClaimFixture, emails: string[]): string {
  if (f.email) return f.email;
  const e = emails[f.emailIndex!];
  if (!e) throw new Error(`fixture ${f.key}: no email at index ${f.emailIndex}`);
  return e;
}

const whoOf = (f: ClaimFixture) => (f.email ? "placeholder" : who(f.emailIndex!));
const fx = (n: number | null | undefined) => (typeof n === "number" ? n.toFixed(2) : " –  ");

export async function runClaims(opts: { placeholder: boolean }): Promise<ClaimRun[]> {
  const emails = claimantEmails(opts.placeholder);
  await waitForServer();
  const runs: ClaimRun[] = [];
  console.log(`\nClaims → ${baseUrl()}/api/claims${opts.placeholder ? "  (placeholder emails: payouts end UNCLAIMED)" : ""}`);
  for (const f of loadClaimFixtures()) {
    const form = new FormData();
    form.set("lat", String(f.lat));
    form.set("lon", String(f.lon));
    form.set("paypal_email", emailFor(f, emails));
    const bytes = fs.readFileSync(path.join(FIXTURES, "photos", f.photo));
    form.set("photo", new Blob([bytes], { type: "image/jpeg" }), f.photo);
    const audio = resolveAudio(f.audio);
    let voice: ClaimRun["voice"] = "none";
    if (audio) {
      form.set("audio", new Blob([fs.readFileSync(audio.file)], { type: audio.mime }), path.basename(audio.file));
      form.set("message", f.message);
      voice = "sent";
    } else {
      const text = f.audio ? (f.fallbackMessage ?? f.message) : f.message;
      form.set("message", text);
      if (f.audio) voice = "fallback-text";
    }

    const t0 = Date.now();
    const res = await fetch(`${baseUrl()}/api/claims`, { method: "POST", body: form });
    const body = (await res.json()) as Partial<Report> & { mode?: string; error?: string; claimPublicId?: string };
    let rep: Report | null = null;
    if (res.status === 201) rep = body as Report;
    else if (res.status === 202 && body.claimPublicId) rep = await pollReport(body.claimPublicId);
    const outcome = rep?.outcome ?? `HTTP ${res.status} ${body.error ?? ""}`;
    const cb = rep ? caughtBy(rep) : null;
    const expectCaughtBy = f.caughtBy ?? null;
    const run: ClaimRun = {
      key: f.key,
      kind: f.kind,
      expect: f.expect,
      expectCaughtBy,
      caughtBy: cb,
      outcome,
      status: rep?.status ?? "-",
      score: rep?.score ?? null,
      reason: rep?.reason ?? "",
      claimPublicId: rep?.claimPublicId ?? body.claimPublicId ?? "-",
      signals: rep?.signals ?? null,
      detail: rep?.detail ?? null,
      ai: rep?.ai ?? null,
      payout: rep?.payout ?? null,
      voice,
      explanation: rep?.explanation ?? "",
      ok: (f.expect as string[]).includes(outcome) && (expectCaughtBy === null || cb === expectCaughtBy),
    };
    runs.push(run);

    const s = run.signals ?? {};
    const pay = run.payout?.payoutBatchId ? `payout ${run.payout.payoutBatchId} ${run.payout.status}` : "";
    console.log(
      `  ${run.ok ? "OK  " : "MISS"} ${pad(f.key, 25)} ${pad(whoOf(f), 11)} score ${pad(run.score ?? "-", 4)} ${pad(outcome, 10)} ${pad(run.status, 14)} ${pad(run.claimPublicId, 23)} ${pay} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
    console.log(
      `       signals photo=${fx(s.photo)} loc=${fx(s.location)} msg=${fx(s.message)} uniq=${fx(s.uniqueness)} vouch=${fx(s.vouching)}` +
        (run.ai?.scores ? ` | AI ${run.ai.provider}${run.ai.cached ? "(cache)" : ""} match=${fx(run.ai.scores.photo_matches_disaster)} ai_risk=${fx(run.ai.scores.photo_ai_generated_risk)} msg=${fx(run.ai.scores.message_consistency)}` : " | AI skipped") +
        ` calls g=${run.ai?.calls.gemini ?? 0} q=${run.ai?.calls.groq ?? 0}`,
    );
    const d = run.detail;
    console.log(
      `       evidence: event ${d?.location?.eventSource ?? "-"}${d?.location?.far ? " FAR" : ""}, kernel ${d?.location?.kernel?.status ?? "-"}${d?.location?.kernel?.cached ? " (cached)" : ""}, exif ${d?.photo?.exif ?? "-"}, clip ${typeof d?.photo?.cosine === "number" ? d.photo.cosine.toFixed(3) : "-"}, voice ${voice}${d?.message?.language ? ` (${d.message.language})` : ""}, vouchers ${d?.vouching?.nearbyVerified ?? 0}`,
    );
    if (f.kind === "fake" || !run.ok) console.log(`       caught by: ${cb ?? "-"}${expectCaughtBy ? ` (expected ${expectCaughtBy})` : ""} | ${run.reason.slice(0, 200)}`);
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
