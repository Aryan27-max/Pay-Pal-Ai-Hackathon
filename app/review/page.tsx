"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewClaim = {
  id: string;
  claimPublicId: string;
  geoCell: string;
  score: number | null;
  signals: Record<string, unknown> | null;
  aiExplanation: string | null;
  messageText: string;
  createdAt: string;
};

/** Reviewer queue: approve or reject only. Reviewers never set amounts or recipients. */
export default function ReviewPage() {
  const [token, setToken] = useState("");
  const [claims, setClaims] = useState<ReviewClaim[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("reviewer-token") ?? "");
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
    setMsg(null);
  }, []);

  useEffect(() => {
    void load(token);
  }, [token, load]);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id);
    const res = await fetch(`/api/review/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-reviewer-token": token },
      body: JSON.stringify({ action }),
    });
    const body = (await res.json()) as { outcome?: string; payout?: { kind: string; payoutBatchId?: string; itemStatus?: string } | null; error?: string };
    setBusy(null);
    setMsg(
      res.ok
        ? `${body.outcome}${body.payout ? ` · payout ${body.payout.kind}${body.payout.payoutBatchId ? ` (${body.payout.payoutBatchId}, ${body.payout.itemStatus})` : ""}` : ""}`
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
        <h1 className="text-xl font-semibold">Review queue (score 50–74)</h1>
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
      <p className="text-sm text-slate-600">You can approve or reject. The amount and recipient are fixed by code. Every decision is recorded.</p>
      {msg && <p className="rounded bg-slate-100 p-2 text-sm">{msg}</p>}
      {claims?.length === 0 && <p className="text-slate-500">No claims waiting for review.</p>}
      {claims?.map((c) => {
        const s = c.signals as Record<string, number> | null;
        return (
          <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <code>{c.claimPublicId}</code>
              <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">score {c.score}</span>
              <span className="text-slate-500">cell {c.geoCell}</span>
              {s && (
                <span className="text-slate-500">
                  photo {s.photo?.toFixed(2)} · location {s.location?.toFixed(2)} · message {s.message?.toFixed(2)} · unique {s.uniqueness} · vouching {s.vouching?.toFixed(2)}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm"><span className="font-medium">AI explanation:</span> {c.aiExplanation}</p>
            <p className="mt-1 text-sm text-slate-600"><span className="font-medium">Message:</span> {c.messageText}</p>
            <div className="mt-3 flex gap-2">
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
