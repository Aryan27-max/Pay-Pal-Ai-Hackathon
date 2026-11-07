"use client";

import { useCallback, useEffect, useState } from "react";

type Detail = {
  location?: { eventName?: string; eventSource?: string; distanceOutsideKm?: number | null; confirmedBy?: string; kernel?: { status?: string; matched?: string[]; hazards?: string[] } };
  photo?: { exif?: string; exifFactor?: number; nearestClaim?: string | null; cosine?: number | null; threshold?: number; nearDuplicate?: boolean; unavailable?: boolean };
  message?: { typed?: boolean; voice?: boolean; transcribed?: boolean; language?: string | null; durationSec?: number | null; error?: string };
  uniqueness?: { reason?: string | null };
  vouching?: { nearbyVerified?: number; radiusKm?: number; unavailable?: boolean };
  ai?: { provider?: string | null; model?: string | null; cached?: boolean; scores?: { photo_matches_disaster: number; photo_ai_generated_risk: number; message_consistency: number } | null; redFlags?: string[] };
};

type ReviewClaim = {
  id: string;
  claimPublicId: string;
  geoCell: string;
  score: number | null;
  signals: (Record<string, number> & { detail?: Detail }) | null;
  engineReason: string | null;
  aiExplanation: string | null;
  aiProvider: string | null;
  messageText: string;
  transcript: string | null;
  transcriptLang: string | null;
  eventSource: string | null;
  createdAt: string;
};

const WEIGHTS: Array<[string, string, number]> = [
  ["photo", "Photo", 30],
  ["location", "Location", 25],
  ["message", "Message", 20],
  ["uniqueness", "Uniqueness", 15],
  ["vouching", "Vouching", 10],
];

function evidenceFor(key: string, d: Detail | undefined): string {
  if (!d) return "";
  const f = (n: number | null | undefined, k = 2) => (typeof n === "number" ? n.toFixed(k) : "–");
  switch (key) {
    case "photo": {
      const a = d.ai?.scores;
      return [
        a ? `matches disaster ${f(a.photo_matches_disaster)}, AI-generated risk ${f(a.photo_ai_generated_risk)}` : "no AI score",
        `EXIF ${d.photo?.exif ?? "?"} (×${f(d.photo?.exifFactor, 1)})`,
        d.photo?.unavailable ? "near-duplicate check unavailable" : `closest earlier photo cosine ${f(d.photo?.cosine, 3)} (threshold ${d.photo?.threshold})`,
      ].join(" · ");
    }
    case "location": {
      const l = d.location;
      const k = l?.kernel;
      return [
        l?.eventName ? `${l.eventName} [${l.eventSource}]` : "no event",
        l?.distanceOutsideKm === 0 ? "inside the event area" : l?.distanceOutsideKm != null ? `${l.distanceOutsideKm} km outside the area` : "",
        k ? `official page (Kernel): ${k.status}${k.matched?.length ? ` – ${k.matched.join(", ")}` : k.hazards?.length ? ` – other hazards: ${k.hazards.join(", ")}` : ""}` : "",
      ].filter(Boolean).join(" · ");
    }
    case "message": {
      const m = d.message;
      return [m?.typed ? "typed text" : "", m?.voice ? `voice note${m.transcribed ? ` (${m.language}, ${m.durationSec ?? "?"} s)` : ` (not transcribed: ${m.error ?? "?"})`}` : "", d.ai?.scores ? `consistency ${f(d.ai.scores.message_consistency)}` : ""].filter(Boolean).join(" · ");
    }
    case "uniqueness":
      return d.uniqueness?.reason ?? "no other claim with this account, photo hash or a near-duplicate photo";
    case "vouching":
      return d.vouching?.unavailable ? "Elastic unavailable" : `${d.vouching?.nearbyVerified ?? 0} verified claims of the same event within ${d.vouching?.radiusKm ?? 10} km`;
    default:
      return "";
  }
}

/** Reviewer queue: approve or reject only, with a required reason. Reviewers never set amounts or recipients. */
export default function ReviewPage() {
  const [token, setToken] = useState("");
  const [claims, setClaims] = useState<ReviewClaim[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("reviewer-token") ?? "");
    setFocus(new URLSearchParams(window.location.search).get("claim"));
  }, []);

  const load = useCallback(async (t: string) => {
    if (!t) return;
    const res = await fetch("/api/review", { headers: { "x-reviewer-token": t }, cache: "no-store" });
    if (res.status === 401) {
      setMsg("Wrong reviewer token.");
      setClaims(null);
      return;
    }
    const body = (await res.json()) as { claims: ReviewClaim[] };
    setClaims(body.claims);
    // Don't clear the message here: act() reloads the queue right after showing the decision outcome.
  }, []);

  useEffect(() => {
    void load(token);
  }, [token, load]);

  async function act(id: string, action: "approve" | "reject") {
    const reason = (reasons[id] ?? "").trim();
    if (reason.length < 5) {
      setMsg("Write a reason (at least 5 characters) before you approve or reject.");
      return;
    }
    setBusy(id);
    const res = await fetch(`/api/review/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-reviewer-token": token },
      body: JSON.stringify({ action, reason }),
    });
    const body = (await res.json()) as { outcome?: string; payout?: { kind: string; payoutBatchId?: string; itemStatus?: string } | null; error?: string };
    setBusy(null);
    setMsg(
      res.ok
        ? `${body.outcome}${body.payout ? ` · payout ${body.payout.kind}${body.payout.payoutBatchId ? ` (${body.payout.payoutBatchId}, ${body.payout.itemStatus})` : ""}` : ""}. Decision recorded.`
        : `Error: ${body.error}`,
    );
    void load(token);
  }

  if (!token) {
    return (
      <form
        className="max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const t = String(new FormData(e.currentTarget).get("t") ?? "");
          sessionStorage.setItem("reviewer-token", t);
          setToken(t);
        }}
      >
        <h1 className="text-xl font-semibold">Reviewer sign-in</h1>
        <input name="t" type="password" placeholder="REVIEWER_ACCESS_TOKEN" className="w-full rounded border border-slate-300 px-3 py-2" />
        <button className="rounded bg-slate-900 px-4 py-2 text-white">Open queue</button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <button
          className="ml-auto text-sm text-slate-500 underline"
          onClick={() => {
            sessionStorage.removeItem("reviewer-token");
            setToken("");
            setClaims(null);
          }}
        >
          Sign out
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Approve or reject, with a reason. The amount and the recipient are fixed by code. Every decision is recorded and will be written to the public trail.
      </p>
      {msg && <p className="rounded bg-slate-100 p-2 text-sm">{msg}</p>}
      {claims?.length === 0 && <p className="text-slate-500">No claims waiting for review.</p>}
      {claims?.map((c) => {
        const s = c.signals;
        const d = s?.detail;
        return (
          <div key={c.id} className={`rounded-lg border bg-white p-4 ${focus === c.claimPublicId ? "border-amber-500 ring-2 ring-amber-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <code>{c.claimPublicId}</code>
              <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">score {c.score}</span>
              <span className="text-slate-500">cell {c.geoCell}</span>
              {c.eventSource === "simulated" && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">SIMULATED event</span>}
              <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            {c.engineReason && <p className="mt-2 text-sm"><span className="font-medium">Why it is here:</span> {c.engineReason}</p>}
            {s && (
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Signal</th>
                    <th className="py-1 pr-3 font-medium">Score</th>
                    <th className="py-1 pr-3 font-medium">Points</th>
                    <th className="py-1 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHTS.map(([k, label, w]) => {
                    const v = typeof s[k] === "number" ? (s[k] as number) : 0;
                    return (
                      <tr key={k} className="border-t border-slate-100 align-top">
                        <td className="py-1 pr-3">{label}</td>
                        <td className={`py-1 pr-3 font-mono ${v < 0.3 ? "text-red-700" : v < 0.7 ? "text-amber-700" : "text-emerald-700"}`}>{v.toFixed(2)}</td>
                        <td className="py-1 pr-3 font-mono text-slate-500">{(v * w).toFixed(1)}/{w}</td>
                        <td className="py-1 text-slate-600">{evidenceFor(k, d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!!d?.ai?.redFlags?.length && (
              <ul className="mt-2 list-inside list-disc text-sm text-red-700">
                {d.ai.redFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm"><span className="font-medium">AI explanation{c.aiProvider ? ` (${c.aiProvider})` : ""}:</span> {c.aiExplanation}</p>
            {c.messageText && <p className="mt-1 text-sm text-slate-600"><span className="font-medium">Message:</span> {c.messageText}</p>}
            {c.transcript && (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium">Voice note ({c.transcriptLang}):</span> {c.transcript}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={reasons[c.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))}
                placeholder="Reason (required, goes on the record)"
                maxLength={300}
                className="min-w-[18rem] flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button disabled={busy === c.id} onClick={() => act(c.id, "approve")} className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                Approve
              </button>
              <button disabled={busy === c.id} onClick={() => act(c.id, "reject")} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
