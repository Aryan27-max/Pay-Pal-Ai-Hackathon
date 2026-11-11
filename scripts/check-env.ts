/**
 * npm run check:env            full check: core + Phase 2 + Phase 3 keys must be set (MISSING = fail)
 * npm run check:env -- --core  judge mode: only the core keys (PayPal sandbox, Gemini, Postgres, …) are
 *                              required; every optional service shows SKIP "disabled: no key" + its effect
 * npm run check:env -- --no-zapier   skip the one Zapier test POST (each POST can use a Zap task)
 *
 * Live checks (cheap, no retries): PayPal OAuth, ONE Gemini call, ONE Groq call (if set), Postgres, Elastic
 * ping, Kernel auth (lists browsers, starts none), ONE Zapier test POST, Solana devnet RPC, trail wallet SOL
 * balance and test-PYUSD balance (Token-2022 mint). No other AI probes: free tiers count every request.
 *
 * SECURITY: this script never prints a value from .env, not even partially (the trail wallet's PUBLIC
 * address is derived and shown, because you need it for the faucets). Errors are scrubbed of env values.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import pg from "pg";
import bs58 from "bs58";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { SERVICES, serviceStatuses } from "../lib/services";

const ROOT = path.resolve(__dirname, "..");
const CORE_MODE = process.argv.includes("--core");

/** Core: the app cannot run without these. */
export const CORE_REQUIRED = [
  "CLAIM_ID_SALT",
  "REVIEWER_ACCESS_TOKEN",
  "NODE_ENV",
  "APP_BASE_URL",
  "AUTO_PAYOUT_THRESHOLD",
  "HUMAN_REVIEW_THRESHOLD",
  "DEFAULT_PACKET_USD",
  "MAX_FIRST_PACKET_USD",
  "WEIGHT_PHOTO",
  "WEIGHT_LOCATION",
  "WEIGHT_MESSAGE",
  "WEIGHT_UNIQUENESS",
  "WEIGHT_VOUCHING",
  "DATABASE_URL",
  "PAYPAL_ENVIRONMENT",
  "PAYPAL_API_BASE",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "PAYPAL_POOL_BUSINESS_EMAIL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL_FAST",
  "GEMINI_MODEL_REASONING",
  "GEMINI_MODEL_VISION",
  "SIM_DONOR_EMAILS",
  "SIM_CLAIMANT_EMAILS",
] as const;
/** Kept for older imports. */
export const PHASE1_REQUIRED = CORE_REQUIRED;

/** Phase 2 / Phase 3 keys = the keys of the optional services (lib/services.ts), per phase. */
export const PHASE2_REQUIRED = [...new Set(SERVICES.filter((s) => s.phase === 2).flatMap((s) => s.keys))];
export const PHASE3_REQUIRED = [...new Set(SERVICES.filter((s) => s.phase === 3).flatMap((s) => s.keys))];
/** Never required: Elastic Cloud key, demo cache flag, deploy keys (deploy comes last). */
const OPTIONAL_ANY = ["ELASTIC_API_KEY", "AI_DEMO_CACHE", "RENDER_API_KEY", "RENDER_WORKFLOW_SERVICE_ID", "RENDER_WORKFLOW_SLUG"];

/** Where to get each key, shown only when it is missing. */
const WHERE: Record<string, string> = {
  CLAIM_ID_SALT: "generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  REVIEWER_ACCESS_TOKEN: "generate the same way as CLAIM_ID_SALT",
  DATABASE_URL: "local Docker Postgres: postgresql://relief:relief@localhost:5433/relief (npm run setup starts it), or a free hosted Neon Postgres URL with ?sslmode=require",
  PAYPAL_CLIENT_ID: "developer.paypal.com → Apps & Credentials → Sandbox → your app",
  PAYPAL_CLIENT_SECRET: "developer.paypal.com → Apps & Credentials → Sandbox → your app",
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "same value as PAYPAL_CLIENT_ID",
  PAYPAL_POOL_BUSINESS_EMAIL: "developer.paypal.com → Testing Tools → Sandbox Accounts → the Business account",
  PAYPAL_WEBHOOK_ID: "developer.paypal.com → your sandbox app → Webhooks → add <tunnel>/api/webhooks/paypal (npm run tunnel)",
  GEMINI_API_KEY: "aistudio.google.com → Get API key (free)",
  GEMINI_MODEL_FAST: "gemini-3.5-flash-lite",
  GEMINI_MODEL_REASONING: "gemini-3.5-flash-lite",
  GEMINI_MODEL_VISION: "gemini-3.5-flash-lite",
  SIM_DONOR_EMAILS: "developer.paypal.com → Testing Tools → Sandbox Accounts → 3 US Personal accounts (comma-separated)",
  SIM_CLAIMANT_EMAILS: "developer.paypal.com → Testing Tools → Sandbox Accounts → 6 US Personal accounts (comma-separated)",
  GROQ_API_KEY: "console.groq.com → API Keys (free tier)",
  GROQ_VISION_MODEL: "qwen/qwen3.8-27b",
  GROQ_WHISPER_MODEL: "whisper-large-v3-turbo",
  ELASTIC_URL: "local Docker Elasticsearch: http://localhost:9200 (npm run setup starts it); or an Elastic Cloud https URL + ELASTIC_API_KEY",
  KERNEL_API_KEY: "dashboard.onkernel.com → API Keys (Developer plan is free)",
  ZAPIER_REVIEW_WEBHOOK_URL: "zapier.com → new Zap → Trigger: Webhooks by Zapier → Catch Hook → copy the URL",
  ZAPIER_ALERT_WEBHOOK_URL: "a SECOND Zap with its own Catch Hook (not the review one)",
  SOLANA_RPC_URL: "https://api.devnet.solana.com (free public devnet RPC)",
  SOLANA_TRAIL_WALLET_SECRET_KEY: "solana-keygen new (or any devnet wallet); base58 or a JSON byte array. DEVNET ONLY",
  PYUSD_DEVNET_MINT: "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM (PYUSD devnet, Token-2022)",
  SOLANA_EXPLORER_BASE: "https://explorer.solana.com",
};

type Env = Record<string, string>;

function loadFile(name: string): Env {
  const p = path.join(ROOT, name);
  return fs.existsSync(p) ? parse(fs.readFileSync(p)) : {};
}

/** Remove every env value (and URL parts of DATABASE_URL) from a message. */
export function makeRedactor(env: Env): (msg: string) => string {
  const secrets = new Set<string>();
  for (const v of Object.values(env)) if (v && v.length >= 4) secrets.add(v);
  try {
    const u = new URL(env.DATABASE_URL ?? "");
    for (const part of [u.username, u.password, u.hostname, u.pathname.slice(1)]) {
      if (part && part.length >= 3 && part !== "localhost") secrets.add(decodeURIComponent(part));
    }
  } catch {
    /* not a URL */
  }
  const sorted = [...secrets].sort((a, b) => b.length - a.length);
  return (msg: string) => {
    let out = msg;
    for (const s of sorted) out = out.split(s).join("[redacted]");
    return out.replace(/\s+/g, " ").slice(0, 200);
  };
}

/** Parse a comma-separated email list. Only the count and validity are ever reported. */
function emailList(raw: string | undefined): { list: string[]; valid: boolean } {
  const list = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { list, valid: list.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) };
}

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const warn = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- live checks (return an optional detail line; throw on failure) ---------------- */

async function checkPayPal(env: Env): Promise<void> {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`HTTP ${res.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim());
}

/** Exactly one tiny generateContent call. No metadata probe, no retry (each request counts on the free tier). */
async function checkGemini(env: Env, model: string): Promise<void> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }], generationConfig: { maxOutputTokens: 8 } }),
  });
  const body = (await res.json().catch(() => ({}))) as { candidates?: unknown[]; error?: { status?: string; message?: string } };
  if (!res.ok || !body.candidates?.length) throw new Error(`HTTP ${res.status} ${body.error?.status ?? ""} ${body.error?.message ?? ""}`.trim());
}

/** Exactly one tiny chat completion on the Groq vision model (text only, a few tokens). */
async function checkGroq(env: Env, model: string): Promise<void> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ok" }], max_completion_tokens: 16, temperature: 0 }),
  });
  const body = (await res.json().catch(() => ({}))) as { choices?: unknown[]; error?: { type?: string; code?: string; message?: string } };
  if (!res.ok || !body.choices?.length) throw new Error(`HTTP ${res.status} ${body.error?.code ?? body.error?.type ?? ""} ${body.error?.message ?? ""}`.trim());
}

/** Elastic: GET / (cluster info). Local Docker needs no key; Elastic Cloud uses ELASTIC_API_KEY. */
async function checkElastic(env: Env): Promise<string> {
  const headers: Record<string, string> = env.ELASTIC_API_KEY ? { Authorization: `ApiKey ${env.ELASTIC_API_KEY}` } : {};
  const res = await fetch(env.ELASTIC_URL!.replace(/\/+$/, "") + "/", { headers, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as { version?: { number?: string; build_flavor?: string } };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `${body.version?.build_flavor ?? "?"} ${body.version?.number ?? ""}${env.ELASTIC_API_KEY ? " (cloud)" : " (local)"}`;
}

/** Kernel: GET /browsers?limit=1 (bearer auth). Starts no browser, costs nothing. */
async function checkKernel(env: Env): Promise<void> {
  const res = await fetch("https://api.onkernel.com/browsers?limit=1", { headers: { Authorization: `Bearer ${env.KERNEL_API_KEY ?? ""}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Zapier: ONE test POST to the review Catch Hook. No PII; kind "test" so Zaps can filter it out. */
async function checkZapier(env: Env): Promise<void> {
  const res = await fetch(env.ZAPIER_REVIEW_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "test", source: "check:env", message: "Relief Stream connectivity test. Ignore." }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string };
  if (!res.ok || body.status !== "success") throw new Error(`HTTP ${res.status} ${body.status ?? ""}`.trim());
}

async function checkDatabase(env: Env): Promise<void> {
  const url = env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** The trail wallet from SOLANA_TRAIL_WALLET_SECRET_KEY (base58 or a JSON byte array). */
export function trailKeypair(secret: string): Keypair {
  const s = secret.trim();
  const bytes = s.startsWith("[") ? Uint8Array.from(JSON.parse(s) as number[]) : bs58.decode(s);
  return Keypair.fromSecretKey(bytes);
}

/** Minimum SOL for ~hundreds of memo transfers (fee 5,000 lamports each) plus rent for token accounts. */
const MIN_SOL = 0.05;

async function checkSolanaRpc(env: Env): Promise<string> {
  const v = await new Connection(env.SOLANA_RPC_URL!, "confirmed").getVersion();
  const devnet = /devnet/.test(env.SOLANA_RPC_URL!);
  if (!devnet) throw new Error("SOLANA_RPC_URL is not a devnet endpoint (devnet only)");
  return `devnet, solana-core ${v["solana-core"]}`;
}

async function checkSolBalance(env: Env): Promise<string> {
  const kp = trailKeypair(env.SOLANA_TRAIL_WALLET_SECRET_KEY!);
  const lamports = await new Connection(env.SOLANA_RPC_URL!, "confirmed").getBalance(kp.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;
  const detail = `wallet ${kp.publicKey.toBase58()} has ${sol.toFixed(4)} SOL`;
  if (sol < MIN_SOL) throw new Error(`${detail}; needs ≥ ${MIN_SOL} devnet SOL (faucet.solana.com)`);
  return detail;
}

async function checkPyusd(env: Env): Promise<string> {
  const conn = new Connection(env.SOLANA_RPC_URL!, "confirmed");
  const mint = new PublicKey(env.PYUSD_DEVNET_MINT!);
  const info = await conn.getAccountInfo(mint);
  if (!info) throw new Error("PYUSD_DEVNET_MINT does not exist on devnet");
  if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error(`mint is owned by ${info.owner.toBase58()}, expected Token-2022`);
  const kp = trailKeypair(env.SOLANA_TRAIL_WALLET_SECRET_KEY!);
  const accounts = await conn.getParsedTokenAccountsByOwner(kp.publicKey, { mint });
  const amount = accounts.value.reduce((s, a) => s + Number((a.account.data as { parsed: { info: { tokenAmount: { uiAmount: number | null } } } }).parsed.info.tokenAmount.uiAmount ?? 0), 0);
  const detail = `Token-2022 mint OK; wallet holds ${amount} test PYUSD in ${accounts.value.length} account(s)`;
  if (amount <= 0) throw new Error(`${detail}; needs test PYUSD (Google Cloud web3 faucet, Solana devnet PYUSD)`);
  return detail;
}

async function main(): Promise<void> {
  const env = loadFile(".env");
  const example = loadFile(".env.example");
  const redact = makeRedactor(env);
  const isSet = (k: string) => Boolean(env[k]?.trim());
  const problems: string[] = [];
  const missingLine = (k: string) => `  ${bad("MISSING")} ${k}  ${dim(WHERE[k] ? `→ ${WHERE[k]}` : "")}`;

  console.log(`\nRelief Stream — environment check (values are never printed)  mode: ${CORE_MODE ? "CORE (judge)" : "FULL"}\n`);
  if (!fs.existsSync(path.join(ROOT, ".env"))) {
    console.log(bad("No .env file. Copy .env.example to .env and fill it in."));
    process.exit(1);
  }

  console.log("Core keys (required in every mode)");
  for (const k of CORE_REQUIRED) {
    if (isSet(k)) console.log(`  ${ok("SET    ")} ${k}`);
    else {
      console.log(missingLine(k));
      problems.push(`${k} is missing${WHERE[k] ? ` (get it: ${WHERE[k]})` : ""}`);
    }
  }

  const statuses = serviceStatuses(env);
  for (const phase of [2, 3] as const) {
    console.log(`\nPhase ${phase} services ${CORE_MODE ? dim("(optional in --core mode)") : dim("(required in full mode)")}`);
    for (const s of statuses.filter((x) => x.phase === phase)) {
      const optional = CORE_MODE;
      for (const k of s.keys) {
        if (isSet(k)) console.log(`  ${ok("SET    ")} ${k}`);
        else if (optional) console.log(`  ${dim("SKIP   ")} ${k}  ${dim(WHERE[k] ? `→ ${WHERE[k]}` : "")}`);
        else {
          console.log(missingLine(k));
          problems.push(`${k} is missing (${s.name})${WHERE[k] ? ` (get it: ${WHERE[k]})` : ""}`);
        }
      }
      if (!s.enabled) console.log(`    ${warn(`disabled: no key → ${s.name}`)}  ${dim(s.whenOff)}`);
    }
  }

  const known = new Set<string>([...CORE_REQUIRED, ...PHASE2_REQUIRED, ...PHASE3_REQUIRED]);
  const other = Object.keys(example).filter((k) => !known.has(k));
  console.log("\nOther keys (optional; deploy keys come last)");
  for (const k of other) console.log(`  ${isSet(k) ? ok("SET    ") : dim("not set")} ${k}${OPTIONAL_ANY.includes(k) ? "" : ""}`);

  // ---- sanity checks ----
  console.log("\nSanity checks");
  const num = (k: string) => Number(env[k]);
  const elasticUrl = env.ELASTIC_URL ?? "";
  const sanity: Array<[string, boolean]> = [
    ["weights add up to 100", ["WEIGHT_PHOTO", "WEIGHT_LOCATION", "WEIGHT_MESSAGE", "WEIGHT_UNIQUENESS", "WEIGHT_VOUCHING"].reduce((s, k) => s + num(k), 0) === 100],
    ["HUMAN_REVIEW_THRESHOLD < AUTO_PAYOUT_THRESHOLD", num("HUMAN_REVIEW_THRESHOLD") < num("AUTO_PAYOUT_THRESHOLD")],
    ["DEFAULT_PACKET_USD <= MAX_FIRST_PACKET_USD", num("DEFAULT_PACKET_USD") > 0 && num("DEFAULT_PACKET_USD") <= num("MAX_FIRST_PACKET_USD")],
    ['PAYPAL_API_BASE contains "sandbox"', (env.PAYPAL_API_BASE ?? "").includes("sandbox")],
    ["PAYPAL_ENVIRONMENT is sandbox", env.PAYPAL_ENVIRONMENT === "sandbox"],
    ["AI_DEMO_CACHE is on, off or empty", ["", "on", "off"].includes((env.AI_DEMO_CACHE ?? "").trim().toLowerCase())],
    ["AI_DEMO_CACHE is not on in production", !(env.NODE_ENV === "production" && (env.AI_DEMO_CACHE ?? "").trim().toLowerCase() === "on")],
    ["AI daily budgets are positive numbers (or empty = defaults 400 / 800)", ["AI_DAILY_CALL_BUDGET_GEMINI", "AI_DAILY_CALL_BUDGET_GROQ"].every((k) => !isSet(k) || Number(env[k]) > 0)],
    ["NEXT_PUBLIC_PAYPAL_CLIENT_ID equals PAYPAL_CLIENT_ID", env.NEXT_PUBLIC_PAYPAL_CLIENT_ID === env.PAYPAL_CLIENT_ID],
    ["CLAIM_ID_SALT is at least 32 chars", (env.CLAIM_ID_SALT ?? "").length >= 32],
    ["SIM_DONOR_EMAILS has 3+ valid emails", emailList(env.SIM_DONOR_EMAILS).valid && emailList(env.SIM_DONOR_EMAILS).list.length >= 3],
    ["SIM_CLAIMANT_EMAILS has 6+ valid emails", emailList(env.SIM_CLAIMANT_EMAILS).valid && emailList(env.SIM_CLAIMANT_EMAILS).list.length >= 6],
    [
      "sandbox donor, claimant and pool emails are all different",
      (() => {
        const all = [...emailList(env.SIM_DONOR_EMAILS).list, ...emailList(env.SIM_CLAIMANT_EMAILS).list, (env.PAYPAL_POOL_BUSINESS_EMAIL ?? "").trim().toLowerCase()];
        return new Set(all).size === all.length;
      })(),
    ],
    ["CLIP_MODE is local (transformers.js on CPU) or off (perceptual hash only)", ["", "local", "off"].includes((env.CLIP_MODE ?? "").trim())],
    ["WHISPER_MODE is groq or local", ["groq", "local", ""].includes((env.WHISPER_MODE ?? "").trim())],
    ["ELASTIC_URL is local http or an https Cloud URL with ELASTIC_API_KEY", !elasticUrl || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(elasticUrl) || (elasticUrl.startsWith("https://") && isSet("ELASTIC_API_KEY"))],
    ["Zapier URLs (if set) are Catch Hooks", ["ZAPIER_REVIEW_WEBHOOK_URL", "ZAPIER_ALERT_WEBHOOK_URL"].every((k) => !isSet(k) || (env[k] ?? "").startsWith("https://hooks.zapier.com/hooks/catch/"))],
    ["ZAPIER_REVIEW and ZAPIER_ALERT (if set) are different Zaps", !(isSet("ZAPIER_REVIEW_WEBHOOK_URL") && env.ZAPIER_REVIEW_WEBHOOK_URL === env.ZAPIER_ALERT_WEBHOOK_URL)],
    ["SOLANA_RPC_URL (if set) is devnet", !isSet("SOLANA_RPC_URL") || /devnet/.test(env.SOLANA_RPC_URL!)],
  ];
  for (const [name, pass] of sanity) {
    console.log(`  ${pass ? ok("PASS") : bad("FAIL")} ${name}`);
    if (!pass) problems.push(`sanity check failed: ${name}`);
  }

  // ---- live checks ----
  console.log("\nLive checks");
  type Live = [string, string[], () => Promise<string | void>];
  const live: Live[] = [
    ["PayPal sandbox OAuth token", ["PAYPAL_API_BASE", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], () => checkPayPal(env)],
    ["Gemini GEMINI_MODEL_VISION (1 call)", ["GEMINI_API_KEY", "GEMINI_MODEL_VISION"], () => checkGemini(env, env.GEMINI_MODEL_VISION!)],
    ["Groq GROQ_VISION_MODEL fallback (1 call)", ["GROQ_API_KEY", "GROQ_VISION_MODEL"], () => checkGroq(env, env.GROQ_VISION_MODEL!)],
    ["Postgres SELECT 1", ["DATABASE_URL"], () => checkDatabase(env)],
    ["Elasticsearch ping (GET /)", ["ELASTIC_URL"], () => checkElastic(env)],
    ["Kernel auth (list browsers, limit 1)", ["KERNEL_API_KEY"], () => checkKernel(env)],
    ["Zapier review Catch Hook (1 test POST)", ["ZAPIER_REVIEW_WEBHOOK_URL"], () => checkZapier(env)],
    ["Solana devnet RPC reachable", ["SOLANA_RPC_URL"], () => checkSolanaRpc(env)],
    ["Trail wallet SOL balance", ["SOLANA_RPC_URL", "SOLANA_TRAIL_WALLET_SECRET_KEY"], () => checkSolBalance(env)],
    ["Trail wallet test-PYUSD balance (Token-2022)", ["SOLANA_RPC_URL", "SOLANA_TRAIL_WALLET_SECRET_KEY", "PYUSD_DEVNET_MINT"], () => checkPyusd(env)],
  ];
  const coreLive = new Set(["PayPal sandbox OAuth token", "Gemini GEMINI_MODEL_VISION (1 call)", "Postgres SELECT 1"]);
  for (const [name, needs, fn] of live) {
    if (name.startsWith("Zapier") && process.argv.includes("--no-zapier")) {
      console.log(`  ${dim("SKIP")} ${name} ${dim("(--no-zapier)")}`);
      continue;
    }
    if (!needs.every(isSet)) {
      const required = coreLive.has(name) || !CORE_MODE;
      console.log(`  ${required ? bad("SKIP") : dim("SKIP")} ${name} ${dim("(disabled: no key)")}`);
      continue;
    }
    try {
      const detail = await withTimeout(fn(), 45_000);
      console.log(`  ${ok("PASS")} ${name}${detail ? dim(`  ${detail}`) : ""}`);
    } catch (e) {
      const msg = redact(e instanceof Error ? e.message : String(e));
      const required = coreLive.has(name) || !CORE_MODE;
      console.log(`  ${required ? bad("FAIL") : warn("WARN")} ${name} — ${msg}`);
      if (required) problems.push(`${name} failed: ${msg}`);
    }
  }

  console.log("");
  if (problems.length) {
    console.log(bad(`check:env FAILED (${problems.length} problem${problems.length > 1 ? "s" : ""}):`));
    for (const p of problems) console.log(`  - ${p}`);
    if (!CORE_MODE) console.log(dim("\nTip: `npm run check:env -- --core` checks only what a judge needs (PayPal sandbox, Gemini, Postgres)."));
    process.exit(1);
  }
  console.log(ok(CORE_MODE ? "check:env PASSED (core). Optional services marked SKIP run disabled." : "check:env PASSED — core + Phase 2 + Phase 3 ready."));
}

main().catch((e) => {
  console.error(bad("check:env crashed:"), e instanceof Error ? e.name : "error");
  process.exit(1);
});
