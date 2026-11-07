import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relief Stream",
  description: "Charity-stream donations paid directly to verified people in a disaster zone, with a public trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-slate-900">
              Relief Stream
            </Link>
            <Link href="/stream" className="text-slate-600 hover:text-slate-900">
              Stream
            </Link>
            <Link href="/admin" className="text-slate-600 hover:text-slate-900">
              Status
            </Link>
            <Link href="/review" className="text-slate-600 hover:text-slate-900">
              Review
            </Link>
            <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              PayPal sandbox · test money only
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
