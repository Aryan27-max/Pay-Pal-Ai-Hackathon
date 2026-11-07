import { db } from "@/lib/db";
import { poolSummary, usd } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/**
 * Phase 1 status page: plain tables of donations, claims, decisions and payouts.
 * Anonymous ids only (no emails, no exact GPS, no messages). AG Grid version comes in Phase 3.
 */
export default async function AdminPage() {
  const [summary, donations, claims, decisions, payouts] = await Promise.all([
    poolSummary(),
    db.donation.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.claim.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.decision.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { claim: { select: { claimPublicId: true } } } }),
    db.payout.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { claim: { select: { claimPublicId: true } }, allocations: { select: { amountUsd: true, donation: { select: { donorPublicId: true } } } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Donated" value={`$${usd(summary.donatedCents)}`} />
        <Stat label="Paid to people" value={`$${usd(summary.paidOutCents)}`} />
        <Stat label="Available in pool" value={`$${usd(summary.availableCents)}`} />
        <Stat label="Donations" value={String(summary.donations)} />
      </div>

      <Table
        title="Claims"
        head={["Claim", "Geo cell (~10 km)", "Status", "Score", "Photo", "Loc", "Msg", "Uniq", "Vouch", "Assessed by", "AI explanation"]}
        rows={claims.map((c) => {
          const s = (c.signals ?? {}) as Record<string, number>;
          const f = (k: string) => (typeof s[k] === "number" ? s[k]!.toFixed(2) : "–");
          return [c.claimPublicId, c.geoCell, <Status key="s" s={c.status} />, c.score ?? "–", f("photo"), f("location"), f("message"), f("uniqueness"), f("vouching"), <Provider key="p" provider={c.aiProvider} model={c.aiModel} cached={c.aiCached} />, <span key="e" className="line-clamp-2 max-w-md text-slate-600">{c.aiExplanation ?? ""}</span>];
        })}
      />

      <Table
        title="Decisions (every one goes on the trail in Phase 2)"
        head={["Time", "Claim", "Actor", "Outcome", "Score", "Reason"]}
        rows={decisions.map((d) => [time(d.createdAt), d.claim.claimPublicId, d.actor, <Status key="o" s={d.outcome} />, d.score ?? "–", d.reason])}
      />

      <Table
        title="Payouts"
        head={["Time", "Claim", "Amount", "Status", "sender_batch_id", "PayPal payout_batch_id", "Funded by (FIFO)"]}
        rows={payouts.map((p) => [
          time(p.createdAt),
          p.claim.claimPublicId,
          `$${Number(p.amountUsd).toFixed(2)}`,
          <Status key="s" s={p.status} />,
          <code key="b" className="text-xs">{p.senderBatchId}</code>,
          <code key="p" className="text-xs">{p.payoutBatchId ?? "–"}</code>,
          p.allocations.map((a) => `${a.donation.donorPublicId.slice(0, 8)} $${Number(a.amountUsd).toFixed(2)}`).join(", ") || "–",
        ])}
      />

      <Table
        title="Donations"
        head={["Time", "Donor (anon)", "Amount", "Remaining", "Source", "PayPal order", "Capture"]}
        rows={donations.map((d) => [
          time(d.createdAt),
          <a key="r" className="underline" href={`/receipt/${d.donorPublicId}`}>{d.donorPublicId}</a>,
          `$${Number(d.amountUsd).toFixed(2)}`,
          `$${Number(d.remainingUsd).toFixed(2)}`,
          d.source,
          <code key="o" className="text-xs">{d.paypalOrderId}</code>,
          <code key="c" className="text-xs">{d.paypalCaptureId}</code>,
        ])}
      />
    </div>
  );
}

const time = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

const COLORS: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800",
  SUCCESS: "bg-emerald-100 text-emerald-800",
  APPROVED: "bg-emerald-50 text-emerald-700",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  WAITING_FUNDS: "bg-amber-50 text-amber-700",
  PAYOUT_PENDING: "bg-sky-100 text-sky-800",
  PENDING: "bg-sky-100 text-sky-800",
  REJECTED: "bg-red-100 text-red-800",
  PAYOUT_FAILED: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
  UNCLAIMED: "bg-orange-100 text-orange-800",
};

/** Which AI assessed the claim: gemini / groq (fallback), and whether it came from the demo cache. */
function Provider({ provider, model, cached }: { provider: string | null; model: string | null; cached: boolean }) {
  if (!provider) return <span className="text-slate-400">none</span>;
  const tone = provider === "groq" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800";
  return (
    <span className="text-xs">
      <span className={`rounded px-1.5 py-0.5 font-medium ${tone}`}>{provider === "groq" ? "groq (fallback)" : provider}</span>{" "}
      <code className="text-slate-500">{model}</code>
      {cached && <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-slate-600">demo cache</span>}
    </span>
  );
}

function Status({ s }: { s: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COLORS[s] ?? "bg-slate-100 text-slate-700"}`}>{s}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={head.length} className="px-3 py-4 text-slate-400">Nothing yet.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                {r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
