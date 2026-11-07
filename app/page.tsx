import Link from "next/link";

const CARDS = [
  { href: "/stream", title: "Charity stream", body: "Donate with PayPal and watch the relief pool fill." },
  { href: "/admin", title: "Status", body: "Every donation, claim, score, decision and payout." },
  { href: "/review", title: "Reviewer", body: "Approve or reject claims in the 50–74 band. No amounts, no recipients." },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Where did your $10 go?</h1>
      <p className="max-w-2xl text-slate-600">
        Donations go into one PayPal relief pool. AI checks each person asking for help; plain code decides. Verified people
        are paid directly with PayPal Payouts. No NGO or middleman holds the money.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
            <div className="font-semibold">{c.title}</div>
            <div className="mt-1 text-sm text-slate-600">{c.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
