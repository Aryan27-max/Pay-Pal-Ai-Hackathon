/**
 * npm run test:api — run the Postman collection with Newman (free CLI) against the local app.
 * Prepares state first (reset, one donation wave, one IN_REVIEW claim for the reviewer requests), then fills
 * a TEMPORARY environment file from .env in the OS temp folder (deleted afterwards; values never printed).
 */
import "./load-env";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import newman from "newman";
import { db } from "@/lib/db";
import { resetDemoData } from "../simulators/reset";
import { claimantEmails, FIXTURES, loadClaimFixtures } from "../simulators/lib";
import { runStream } from "../simulators/stream";

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.SIM_BASE_URL || "http://localhost:3000";

(async () => {
  await resetDemoData();
  await runStream([{ name: "Ron", amountUsd: 10 }], "Setup donation");
  const f = loadClaimFixtures().find((x) => x.key === "borderline-no-damage")!;
  const form = new FormData();
  form.set("lat", String(f.lat));
  form.set("lon", String(f.lon));
  form.set("message", f.message);
  form.set("paypal_email", claimantEmails(false)[f.emailIndex!]!);
  form.set("photo", new Blob([new Uint8Array(fs.readFileSync(path.join(FIXTURES, "photos", f.photo)))], { type: "image/jpeg" }), f.photo);
  const r = (await (await fetch(`${BASE}/api/claims`, { method: "POST", body: form })).json()) as { outcome: string };
  console.log(`Setup claim for the reviewer requests: ${r.outcome}`);

  const env = JSON.parse(fs.readFileSync(path.join(ROOT, "postman", "relief-stream.local.postman_environment.json"), "utf8")) as { values: Array<{ key: string; value: string }> };
  const fill: Record<string, string> = {
    baseUrl: BASE,
    paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
    reviewerToken: process.env.REVIEWER_ACCESS_TOKEN ?? "",
    claimantEmail: claimantEmails(false)[0]!,
  };
  for (const v of env.values) if (v.key in fill) v.value = fill[v.key]!;
  const tmp = path.join(os.tmpdir(), `relief-newman-env-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(env));

  try {
    const summary = await new Promise<newman.NewmanRunSummary>((resolve, reject) =>
      newman.run(
        {
          collection: path.join(ROOT, "postman", "relief-stream.postman_collection.json"),
          environment: tmp,
          workingDir: ROOT, // file uploads (fixture photo/audio) are relative to the repo
          reporters: ["cli"],
          reporter: { cli: { noSummary: false, noBanner: true } },
          timeoutRequest: 180_000,
        },
        (err, s) => (err ? reject(err) : resolve(s)),
      ),
    );
    const st = summary.run.stats;
    console.log(`\nNewman: requests ${st.requests.total - st.requests.failed}/${st.requests.total} ok, assertions ${st.assertions.total - st.assertions.failed}/${st.assertions.total} passed`);
    process.exitCode = st.assertions.failed || st.requests.failed ? 1 : 0;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
})()
  .catch((e) => {
    console.error("newman run failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
