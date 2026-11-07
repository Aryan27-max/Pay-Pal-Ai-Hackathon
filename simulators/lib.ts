import "../scripts/load-env";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const ROOT = path.resolve(__dirname, "..");
export const FIXTURES = path.join(ROOT, "simulators", "fixtures");

export function baseUrl(): string {
  return (process.env.SIM_BASE_URL || process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function operatorToken(): string {
  const t = process.env.REVIEWER_ACCESS_TOKEN;
  if (!t) throw new Error("REVIEWER_ACCESS_TOKEN is not set (run npm run check:env)");
  return t;
}

export const ClaimFixtureSchema = z.object({
  key: z.string(),
  kind: z.enum(["genuine", "borderline", "fake"]),
  expect: z.enum(["APPROVED", "IN_REVIEW", "REJECTED"]),
  emailIndex: z.number().int().min(0),
  lat: z.number(),
  lon: z.number(),
  photo: z.string(),
  message: z.string(),
});
export type ClaimFixture = z.infer<typeof ClaimFixtureSchema>;

export function loadClaimFixtures(): ClaimFixture[] {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, "claims.json"), "utf8")) as { claims: unknown[] };
  return z.array(ClaimFixtureSchema).parse(raw.claims);
}

/** Sandbox claimant emails. --placeholder uses example.com addresses (payouts end UNCLAIMED). */
export function claimantEmails(placeholder: boolean): string[] {
  if (placeholder) return Array.from({ length: 6 }, (_, i) => `relief-claimant-${i + 1}@example.com`);
  const list = (process.env.SIM_CLAIMANT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length < 6) {
    throw new Error(
      `SIM_CLAIMANT_EMAILS needs 6 sandbox PERSONAL account emails (has ${list.length}). ` +
        "Create them at developer.paypal.com → Testing Tools → Sandbox Accounts, or pass --placeholder.",
    );
  }
  return list;
}

/** Only show the claimant's index, never the address. */
export const who = (i: number) => `claimant#${i + 1}`;

export async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl()}/api/pool`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`App not reachable at ${baseUrl()} — start it with npm run dev`);
}

export function pad(s: unknown, n: number): string {
  const t = String(s ?? "");
  return t.length >= n ? t.slice(0, n) : t + " ".repeat(n - t.length);
}
