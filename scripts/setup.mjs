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
import fs from "node:fs";
import { composeUp, dockerOk, readEnv, run, waitForStack } from "./local-stack.mjs";

const step = (n, s) => console.log(`\n\x1b[1m[setup ${n}/6] ${s}\x1b[0m`);

step(1, ".env");
if (!fs.existsSync(".env")) {
  fs.copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example. Add your PayPal sandbox + Gemini keys (README → Run it locally), then re-run npm run setup.");
} else console.log(".env found (values are never printed).");
const env = readEnv();

step(2, "Docker: local Postgres + Elasticsearch");
if (!dockerOk()) {
  console.error("Docker is not running. Start Docker Desktop (free) and re-run npm run setup.");
  process.exit(1);
}
const started = composeUp(env);
console.log(started.length ? `running: ${started.join(", ")}` : "DATABASE_URL / ELASTIC_URL point elsewhere: no local containers needed.");
await waitForStack(env);

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
