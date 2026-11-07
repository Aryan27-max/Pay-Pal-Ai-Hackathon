"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useCallback, useEffect, useRef, useState } from "react";

type Pool = {
  donatedUsd: string;
  paidOutUsd: string;
  availableUsd: string;
  donations: number;
  recent: { donor: string; amountUsd: string; at: string }[];
};

type ChatLine = { id: string; who: string; text: string; kind: "chat" | "donation" | "system" };
type Receipt = { donorPublicId: string | null; orderId: string; amountUsd: string };

const FAKE_CHAT: [string, string][] = [
  ["mira_plays", "the river footage is unreal, stay safe everyone"],
  ["kofi", "is the money going straight to people?"],
  ["streamer", "yes, verified people get paid by PayPal directly, no middleman"],
  ["sam_k", "love that there is a public receipt"],
  ["lena", "just shared the stream"],
  ["ravi", "how do you stop fake claims?"],
  ["streamer", "AI checks photo, place and story; duplicates get rejected automatically"],
];

const AMOUNTS = [5, 10, 25];

export default function StreamClient({ clientId }: { clientId: string }) {
  const [pool, setPool] = useState<Pool | null>(null);
  const [amount, setAmount] = useState(10);
  const [chat, setChat] = useState<ChatLine[]>([
    { id: "s0", who: "system", text: "Stream started · Missouri River flood relief", kind: "system" },
  ]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/pool", { cache: "no-store" });
    if (!res.ok) return;
    const p = (await res.json()) as Pool;
    setPool(p);
    const fresh = p.recent.filter((d) => !seen.current.has(d.at + d.donor)).reverse();
    if (fresh.length) {
      fresh.forEach((d) => seen.current.add(d.at + d.donor));
      const lines: ChatLine[] = fresh.map((d) => ({
        id: d.at + d.donor,
        who: d.donor.slice(0, 8),
        text: `donated $${d.amountUsd}`,
        kind: "donation",
      }));
      setChat((c) => [...c, ...lines].slice(-40));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(refresh, 3000);
    let i = 0;
    const talk = setInterval(() => {
      const [who, text] = FAKE_CHAT[i % FAKE_CHAT.length]!;
      const line: ChatLine = { id: `f${i}`, who, text, kind: "chat" };
      setChat((prev) => [...prev, line].slice(-40));
      i++;
    }, 4500);
    return () => {
      clearInterval(poll);
      clearInterval(talk);
    };
  }, [refresh]);

  async function createOrder(): Promise<string> {
    setError(null);
    const res = await fetch("/api/donations/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsd: amount, streamId: "main" }),
    });
    const body = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !body.id) throw new Error(body.error ?? "could not create order");
    return body.id;
  }

  async function onApprove(data: { orderID: string }): Promise<void> {
    const res = await fetch("/api/donations/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: data.orderID }),
    });
    const body = (await res.json()) as Receipt & { error?: string };
    if (!res.ok) {
      setError(body.error ?? "capture failed");
      return;
    }
    setReceipt(body);
    void refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-sky-900 via-slate-800 to-amber-900">
          <span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">● LIVE</span>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white">
            <div className="text-sm uppercase tracking-widest text-sky-200">Charity stream</div>
            <div className="mt-1 text-2xl font-bold">Missouri River flood relief</div>
            <div className="mt-1 text-sm text-slate-300">(simulated demo event)</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Donated" value={pool ? `$${pool.donatedUsd}` : "…"} />
          <Stat label="Paid to people" value={pool ? `$${pool.paidOutUsd}` : "…"} />
          <Stat label="In the pool" value={pool ? `$${pool.availableUsd}` : "…"} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium">Donate</span>
            {AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(a)}
                className={`rounded px-3 py-1 text-sm ${amount === a ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                ${a}
              </button>
            ))}
          </div>
          {clientId ? (
            <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}>
              <PayPalButtons
                style={{ layout: "horizontal", tagline: false }}
                forceReRender={[amount]}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={(e) => setError(e instanceof Error ? e.message : "PayPal error")}
              />
            </PayPalScriptProvider>
          ) : (
            <p className="text-sm text-red-600">NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set.</p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {receipt && (
            <p className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">
              Thank you! ${receipt.amountUsd} is in the pool (order {receipt.orderId}).{" "}
              {receipt.donorPublicId && (
                <a className="underline" href={`/receipt/${receipt.donorPublicId}`}>
                  Your receipt
                </a>
              )}
            </p>
          )}
        </div>
      </section>

      <aside className="flex h-[560px] flex-col rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium">Live chat</div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
          {chat.map((l) => (
            <li
              key={l.id}
              className={
                l.kind === "donation"
                  ? "rounded bg-amber-50 px-2 py-1 font-medium text-amber-900"
                  : l.kind === "system"
                    ? "text-slate-400"
                    : ""
              }
            >
              <span className="font-semibold text-slate-700">{l.who}</span> <span className="text-slate-600">{l.text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
