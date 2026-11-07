import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { donorReceipt } from "@/lib/public/receipt";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your receipt · Relief Stream" };

const money = (v: string) => `$${Number(v).toFixed(2)}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function Record({ r, label }: { r: { status: string; url: string | null; memo: string } | null; label: string }) {
  if (!r) return null;
  if (r.url)
    return (
      <a href={r.url} target="_blank" rel="noreferrer" title={r.memo} className="text-emerald-700 hover:underline">
        {label} on Solana ↗
      </a>
    );
  return (
    <span className="text-slate-400" title={r.memo}>
      {label}: {r.status === "DISABLED" ? "trail off" : "queued for Solana"}
    </span>
  );
}

/** Donor receipt: "$10 → claim 16D9 (flood zone), verified 15:42", with every allocation and its public records. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await donorReceipt(id);
  if (!r) notFound();
  const total = r.donations.reduce((s, d) => s + Number(d.amountUsd), 0);
  const reached = r.donations.reduce((s, d) => s + d.reached.reduce((x, a) => x + Number(a.amountUsd), 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Your receipt</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {money(String(reached))} of your {money(String(total))} has reached people in the disaster zone.
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Paid directly with PayPal to verified people, no middleman. Donor id <code className="font-mono">{r.donor}</code> is anonymous: we never store your email.
        </p>
      </div>

      {r.donations.map((d) => (
        <section key={d.paypalCaptureId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="text-lg font-semibold">{money(d.amountUsd)} donated</div>
            <div className="text-xs text-slate-500">
              {day(d.at)} {hhmm(d.at)} · PayPal order <code className="font-mono">{d.paypalOrderId}</code> · <Record r={d.record} label="donation" />
            </div>
          </div>
          {d.reached.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Waiting in the relief pool for the next verified claim. Check back soon.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.reached.map((a) => (
                <li key={a.claim + a.amountUsd} className="px-4 py-3">
                  <div className="text-base">
                    <span className="font-semibold text-emerald-700">{money(a.amountUsd)}</span> → claim <span className="font-semibold">{a.claimShort}</span> ({a.event}),{" "}
                    {a.verifiedAt ? <>verified {hhmm(a.verifiedAt)}</> : "verified"}
                    {a.simulatedEvent && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-violet-700">SIMULATED EVENT</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>
                      claim <code className="font-mono">{a.claim}</code> · area {a.cell} (~10 km)
                    </span>
                    {a.verifiedBy && (
                      <span>
                        approved by the {a.verifiedBy}
                        {a.score !== null ? ` (score ${a.score})` : ""}
                      </span>
                    )}
                    <span>
                      PayPal payout <code className="font-mono">{a.paypalPayoutBatchId ?? "–"}</code> {a.payoutStatus.toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
                    <Record r={a.approvalRecord} label="approval" />
                    <Record r={a.payoutRecord} label="payout" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {Number(d.stillInPoolUsd) > 0 && d.reached.length > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{money(d.stillInPoolUsd)} of this donation is still in the pool.</p>}
        </section>
      ))}

      <p className="text-xs text-slate-500">
        See every donation, decision and payout on the <Link href="/dashboard" className="underline">public dashboard</Link>. Sandbox and devnet only: test money.
      </p>
    </div>
  );
}
