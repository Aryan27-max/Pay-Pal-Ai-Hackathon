import type { Metadata } from "next";
import Dashboard from "./Dashboard";

export const metadata: Metadata = { title: "Public dashboard · Relief Stream" };

/** Public transparency dashboard (AG Grid Community). Data: GET /api/trail (redacted by construction). */
export default function DashboardPage() {
  return <Dashboard />;
}
