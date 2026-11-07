"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import type { PublicFeed, TrailRef } from "@/lib/public/feed";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#059669",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  headerBackgroundColor: "#f8fafc",
  headerTextColor: "#475569",
  rowHoverColor: "#f0fdf4",
  borderRadius: 6,
  wrapperBorderRadius: 12,
  spacing: 7,
});

const money = (v: string | number) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeOf = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800",
  SUCCESS: "bg-emerald-100 text-emerald-800",
  APPROVED: "bg-emerald-50 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  WAITING_FUNDS: "bg-sky-100 text-sky-800",
  PAYOUT_PENDING: "bg-sky-100 text-sky-800",
  PENDING: "bg-sky-100 text-sky-800",
  SENT: "bg-sky-100 text-sky-800",
  SENDING: "bg-sky-100 text-sky-800",
  REJECTED: "bg-rose-100 text-rose-800",
  FAILED: "bg-rose-100 text-rose-800",
  PAYOUT_FAILED: "bg-rose-100 text-rose-800",
  UNCLAIMED: "bg-rose-100 text-rose-800",
  DISABLED: "bg-slate-100 text-slate-500",
};

function Badge({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${STATUS_STYLE[value] ?? "bg-slate-100 text-slate-700"}`}>{value.replace(/_/g, " ")}</span>;
}

const StatusCell = (p: ICellRendererParams) => (p.value ? <Badge value={String(p.value)} /> : null);

function ChainCell(p: ICellRendererParams<unknown, TrailRef>) {
  const t = p.value;
  if (!t) return <span className="text-slate-400">–</span>;
  if (t.url)
    return (
      <a href={t.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline" title={t.memo ?? ""}>
        Solana ↗
      </a>
    );
  return <span title={t.memo ?? ""}>{t.status === "DISABLED" ? <span className="text-slate-400">trail off</span> : <Badge value={t.status} />}</span>;
}

const DonorCell = (p: ICellRendererParams) => (
  <Link href={`/receipt/${p.value}`} className="font-mono text-[12px] text-emerald-700 hover:underline">
    {p.value}
  </Link>
);
const Mono = (p: ICellRendererParams) => <span className="font-mono text-[12px]">{p.value ?? "–"}</span>;
/** Claim ids: the short code people see on receipts (e.g. 16D9), full id on hover. */
const ClaimCell = (p: ICellRendererParams) =>
  p.value ? (
    <span title={String(p.value)}>
      <span className="font-semibold">{String(p.value).slice(2, 6).toUpperCase()}</span>
      <span className="ml-1 font-mono text-[11px] text-slate-400">{String(p.value).slice(6, 12)}…</span>
    </span>
  ) : null;
const WRAP = { wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.45", paddingTop: "9px", paddingBottom: "9px", whiteSpace: "normal" } } as const;

function ScoreCell(p: ICellRendererParams) {
  const v = typeof p.value === "number" ? p.value : null;
  if (v === null) return <span className="text-slate-400">–</span>;
  const color = v >= 75 ? "bg-emerald-500" : v >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="flex items-center gap-2">
      <span className="w-6 text-right font-semibold tabular-nums">{v}</span>
      <span className="h-1.5 w-16 rounded bg-slate-100">
        <span className={`block h-1.5 rounded ${color}`} style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

function FundedBy(p: ICellRendererParams<unknown, Array<{ donor: string; amountUsd: string }>>) {
  const list = p.value ?? [];
  if (!list.length) return <span className="text-slate-400">–</span>;
  return (
    <span className="flex flex-wrap gap-1 leading-5">
      {list.map((a, i) => (
        <Link key={i} href={`/receipt/${a.donor}`} className="rounded bg-slate-100 px-1.5 font-mono text-[11px] leading-5 text-slate-700 hover:bg-emerald-50">
          {a.donor.slice(0, 8)}… {money(a.amountUsd)}
        </Link>
      ))}
    </span>
  );
}

const EventCell = (p: ICellRendererParams<{ simulatedEvent?: boolean }>) => (
  <span>
    {p.value}
    {p.data?.simulatedEvent && (
      <span title="Clearly labelled SIMULATED demo event (same code path as real GDACS/USGS events)" className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700">
        SIM
      </span>
    )}
  </span>
);

type Tab = "payouts" | "decisions" | "donations" | "claims" | "chain";

export default function Dashboard() {
  const [feed, setFeed] = useState<PublicFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("payouts");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/trail", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFeed((await r.json()) as PublicFeed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    void load();
    const a = setInterval(() => void load(), 5000);
    const b = setInterval(() => setNow(Date.now()), 1000);
    return () => (clearInterval(a), clearInterval(b));
  }, [load]);

  const cols = useMemo(() => {
    const base = { sortable: true, resizable: true, filter: true };
    const t: ColDef = { field: "at", headerName: "Time", width: 136, valueFormatter: (p) => (p.value ? timeOf(p.value) : ""), sort: "desc" };
    const claim: ColDef = { field: "claim", headerName: "Claim", width: 118, cellRenderer: ClaimCell };
    return {
      payouts: [
        t,
        claim,
        { field: "amountUsd", headerName: "Paid", width: 82, valueFormatter: (p) => money(p.value), cellClass: "font-semibold text-emerald-700" },
        { field: "event", headerName: "Disaster", flex: 1, minWidth: 170, cellRenderer: EventCell },
        { field: "cell", headerName: "Area", width: 100, headerTooltip: "Rounded to ~10 km" },
        { field: "fundedBy", headerName: "Funded by (oldest donations first)", flex: 1.3, minWidth: 210, cellRenderer: FundedBy, ...WRAP, sortable: false, filter: false, cellDataType: false },
        { field: "status", headerName: "PayPal", width: 104, cellRenderer: StatusCell },
        { field: "paypalPayoutBatchId", headerName: "PayPal batch", width: 128, cellRenderer: Mono },
        { field: "trail", headerName: "On chain", width: 98, cellRenderer: ChainCell, sortable: false, filter: false, cellDataType: false },
      ] as ColDef[],
      decisions: [
        t,
        claim,
        { field: "actor", headerName: "Decided by", width: 128, valueFormatter: (p) => (p.value === "engine" ? "Engine (code)" : "Human reviewer") },
        { field: "outcome", headerName: "Outcome", width: 116, cellRenderer: StatusCell },
        { field: "score", headerName: "Score", width: 122, cellRenderer: ScoreCell },
        { field: "reason", headerName: "Why (deterministic rules)", flex: 1, minWidth: 320, ...WRAP, cellClass: "text-slate-600" },
        { field: "trail", headerName: "On chain", width: 98, cellRenderer: ChainCell, sortable: false, filter: false, cellDataType: false },
      ] as ColDef[],
      donations: [
        t,
        { field: "donor", headerName: "Donor (anonymous)", width: 210, cellRenderer: DonorCell },
        { field: "amountUsd", headerName: "Donated", width: 100, valueFormatter: (p) => money(p.value), cellClass: "font-semibold" },
        { field: "remainingUsd", headerName: "Still in pool", width: 115, valueFormatter: (p) => money(p.value) },
        { field: "source", headerName: "Via", width: 125, valueFormatter: (p) => (p.value === "paypal_button" ? "PayPal button" : "Sandbox card (sim)") },
        { field: "paypalCaptureId", headerName: "PayPal capture", flex: 1, minWidth: 170, cellRenderer: Mono },
        { field: "trail", headerName: "On chain", width: 98, cellRenderer: ChainCell, sortable: false, filter: false, cellDataType: false },
      ] as ColDef[],
      claims: [
        t,
        claim,
        { field: "event", headerName: "Disaster", flex: 1, minWidth: 260, cellRenderer: EventCell },
        { field: "cell", headerName: "Area (~10 km)", width: 120 },
        { field: "status", headerName: "Status", width: 140, cellRenderer: StatusCell },
        { field: "score", headerName: "Score", width: 130, cellRenderer: ScoreCell },
      ] as ColDef[],
      chain: [
        t,
        { field: "type", headerName: "Record", width: 150 },
        { field: "publicId", headerName: "Public id", width: 200, cellRenderer: Mono },
        { field: "amountUsd", headerName: "USD", width: 85 },
        { field: "memo", headerName: "On-chain memo (sha256 = hash of the public row)", flex: 1, minWidth: 380, cellRenderer: Mono, ...WRAP, tooltipValueGetter: (p) => JSON.stringify(p.data?.rowJson) },
        { field: "status", headerName: "Status", width: 115, cellRenderer: StatusCell },
        {
          field: "url",
          headerName: "Transaction",
          width: 120,
          cellRenderer: (p: ICellRendererParams) =>
            p.value ? (
              <a href={p.value} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
                Explorer ↗
              </a>
            ) : (
              <span className="text-slate-400">–</span>
            ),
          sortable: false,
          filter: false,
        },
      ] as ColDef[],
    } satisfies Record<Tab, ColDef[]>;
  }, []);

  const rows: Record<Tab, unknown[]> = feed
    ? { payouts: feed.payouts, decisions: feed.decisions, donations: feed.donations, claims: feed.claims, chain: feed.trailEntries }
    : { payouts: [], decisions: [], donations: [], claims: [], chain: [] };

  const p = feed?.pool;
  const donated = Number(p?.donatedUsd ?? 0);
  const paid = Number(p?.paidOutUsd ?? 0);
  const avail = Number(p?.availableUsd ?? 0);
  const reserved = Math.max(0, donated - paid - avail);
  const pct = (v: number) => (donated > 0 ? `${(v / donated) * 100}%` : "0%");
  const ago = feed ? Math.max(0, Math.round((now - new Date(feed.generatedAt).getTime()) / 1000)) : null;

  const TABS: Array<[Tab, string, number]> = [
    ["payouts", "Payouts", feed?.payouts.length ?? 0],
    ["decisions", "Decisions", feed?.decisions.length ?? 0],
    ["donations", "Donations", feed?.donations.length ?? 0],
    ["claims", "Claims", feed?.claims.length ?? 0],
    ["chain", "On-chain records", feed?.trailEntries.length ?? 0],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Every dollar, accounted for.</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Donations go into one PayPal relief pool and are paid <span className="font-semibold text-slate-800">directly</span> to verified people in the disaster zone. Every
            donation, decision and payout is public here, with anonymous ids, and written to Solana devnet.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-rose-500" : "animate-pulse bg-emerald-500"}`} />
          {error ? `offline (${error})` : ago === null ? "loading…" : `live · updated ${ago}s ago`}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Donated" value={money(donated)} sub={`${p?.donations ?? 0} donations`} />
        <Tile label="Paid directly to people" value={money(paid)} sub={`${p?.peoplePaid ?? 0} people · no middleman`} strong />
        <Tile label="In the pool" value={money(avail)} sub={`${p?.waiting ?? 0} verified claims waiting`} />
        <Tile label="Stopped by checks" value={String((p?.rejected ?? 0) + (p?.inReview ?? 0))} sub={`${p?.rejected ?? 0} rejected · ${p?.inReview ?? 0} with a human`} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold">Where the money is</span>
          <span className="text-slate-500">
            {feed?.trail.enabled ? (
              <>
                Public trail: <span className="font-semibold text-slate-700">{feed.trail.confirmed}</span> records on Solana devnet
                {feed.trail.queued ? `, ${feed.trail.queued} queued` : ""}
              </>
            ) : (
              "Public trail disabled (no Solana key)"
            )}
          </span>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-emerald-500 transition-all" style={{ width: pct(paid) }} title={`paid ${money(paid)}`} />
          <div className="bg-sky-400 transition-all" style={{ width: pct(reserved) }} title={`being paid ${money(reserved)}`} />
          <div className="bg-slate-300 transition-all" style={{ width: pct(avail) }} title={`available ${money(avail)}`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <Legend color="bg-emerald-500" label={`Paid to people ${money(paid)}`} />
          <Legend color="bg-sky-400" label={`Payout in flight ${money(reserved)}`} />
          <Legend color="bg-slate-300" label={`Available ${money(avail)}`} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {TABS.map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {label} <span className={`ml-1 text-xs ${tab === k ? "text-slate-300" : "text-slate-400"}`}>{n}</span>
            </button>
          ))}
        </div>
        <div>
          <AgGridReact
            theme={theme}
            domLayout="autoHeight"
            rowData={rows[tab]}
            columnDefs={cols[tab]}
            defaultColDef={{ sortable: true, resizable: true, filter: true }}
            animateRows
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            tooltipShowDelay={300}
            overlayNoRowsTemplate="<span class='text-slate-400'>Nothing yet. Run npm run demo to see the money move.</span>"
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Anonymous ids are one-way hashes (HMAC). Locations are rounded to ~10 km. Each on-chain memo is <code className="font-mono">{feed?.trail.memoFormat}</code>; the row JSON behind
          every hash is in <a className="underline" href="/api/trail">/api/trail</a>, so anyone can recompute it. Sandbox and devnet only: test money.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${strong ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
    {label}
  </span>
);
