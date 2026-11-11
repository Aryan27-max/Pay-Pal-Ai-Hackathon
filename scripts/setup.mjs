/**
 * npm run setup — one command for a fresh clone (runs after `npm install`):
 *   1. .env from .env.example if missing (you then add your PayPal sandbox + Gemini keys)
 *   2. docker compose up: local Postgres (5433) + Elasticsearch (9200)
 *   3. prisma migrate deploy
 *   4. Elasticsearch indices (if ELASTIC_URL is set)
 *   5. CLIP model download (~90 MB, once)
 *   6. seed: validated AI results for the demo FIXTURES (so a demo run makes no AI calls)
 * Zero cost: everything here is free and local.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { composeUp, dockerOk, localServices, readEnv, run, waitForStack } from "./local-stack.mjs";

const step = (n, s) => console.log(`\n\x1b[1m[setup ${n}/6] ${s}\x1b[0m`);

step(1, ".env");
// A missing OR empty .env (e.g. created by an editor) starts from the template.
if (!fs.existsSync(".env") || !fs.readFileSync(".env", "utf8").trim()) {
  fs.copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example.");
} else console.log(".env found (values are never printed).");
// Generate the two local secrets if they are empty (random, written to .env, never printed).
{
  const gen = { CLAIM_ID_SALT: () => crypto.randomBytes(32).toString("hex"), REVIEWER_ACCESS_TOKEN: () => crypto.randomBytes(24).toString("hex") };
  let text = fs.readFileSync(".env", "utf8");
  const filled = [];
  for (const [k, make] of Object.entries(gen)) {
    const re = new RegExp(`^${k}=[ \\t]*"?"?[ \\t]*$`, "m");
    if (re.test(text)) (text = text.replace(re, `${k}=${make()}`), filled.push(k));
    else if (!new RegExp(`^${k}=`, "m").test(text)) (text += `\n${k}=${make()}\n`, filled.push(k));
  }
  if (filled.length) (fs.writeFileSync(".env", text), console.log(`Generated ${filled.join(" and ")} in .env.`));
}
const env = readEnv();
// Stop before doing any work if the core keys are still empty (README → Run in 10 minutes → Keys).
const CORE = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "NEXT_PUBLIC_PAYPAL_CLIENT_ID", "PAYPAL_POOL_BUSINESS_EMAIL", "SIM_DONOR_EMAILS", "SIM_CLAIMANT_EMAILS", "GEMINI_API_KEY"];
const missing = CORE.filter((k) => !env[k]);
if (missing.length) {
  console.log(`\nAdd these keys to .env (README → Run in 10 minutes → Keys), then run npm run setup again:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

step(2, "Docker: local Postgres + Elasticsearch");
if (!localServices(env).length) {
  console.log("DATABASE_URL is a hosted Postgres and ELASTIC_URL is not local: no Docker needed.");
} else {
  if (!dockerOk()) {
    console.error("Docker is not running. Start Docker Desktop (free) and re-run npm run setup.\nNo Docker? Put a hosted Postgres URL (e.g. Neon's free plan) in DATABASE_URL and leave ELASTIC_URL empty.");
    process.exit(1);
  }
  console.log(`running: ${composeUp(env).join(", ")}`);
  await waitForStack(env);
}

step(3, "Database migrations");
run("npx prisma migrate deploy");

step(4, "Elasticsearch indices");
if (env.ELASTIC_URL) run("npx tsx scripts/elastic-setup.ts");
else console.log("ELASTIC_URL not set: Elasticsearch disabled (see /admin → Optional services).");

step(5, "CLIP model (downloaded once, runs on your CPU)");
run("npx tsx scripts/clip-prefetch.ts");

step(6, "Seed");
run("npx tsx scripts/seed.ts");

console.log("\n\x1b[32mSetup done.\x1b[0m Next:\n  npm run check:env -- --core   (only PayPal sandbox + Gemini + Postgres needed)\n  npm run dev:local             (http://localhost:3000)\n  npm run demo                  (scripted demo, in a second terminal)");
