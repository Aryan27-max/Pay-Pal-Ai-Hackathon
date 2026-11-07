/**
 * npm run check:env
 *
 * Reports every key in .env.example as SET / MISSING, runs sanity checks and
 * live checks: PayPal OAuth, ONE cheap Gemini call (GEMINI_MODEL_VISION), ONE cheap Groq call
 * (GROQ_VISION_MODEL, if set), Postgres SELECT 1. No other AI probes: free tiers count every request.
 *
 * SECURITY: this script never prints a value from .env, not even partially.
 * Every error message is scrubbed of all env values before it is shown.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import pg from "pg";

const ROOT = path.resolve(__dirname, "..");

export const PHASE1_REQUIRED = [
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

const PHASE1_OPTIONAL = ["PAYPAL_WEBHOOK_ID", "GROQ_API_KEY", "GROQ_VISION_MODEL", "AI_DEMO_CACHE"] as const;

/** Where to get each Phase 1 key, shown only when it is missing. */
const WHERE: Record<string, string> = {
  CLAIM_ID_SALT: "generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  REVIEWER_ACCESS_TOKEN: "generate the same way as CLAIM_ID_SALT",
  DATABASE_URL: "Render dashboard → your Postgres → Connections → External Database URL",
  PAYPAL_CLIENT_ID: "developer.paypal.com → Apps & Credentials → Sandbox → your app",
  PAYPAL_CLIENT_SECRET: "developer.paypal.com → Apps & Credentials → Sandbox → your app",
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: "same value as PAYPAL_CLIENT_ID",
  PAYPAL_POOL_BUSINESS_EMAIL: "developer.paypal.com → Testing Tools → Sandbox Accounts → the Business account",
  GEMINI_API_KEY: "aistudio.google.com → Get API key",
  GEMINI_MODEL_FAST: "aistudio.google.com model list (e.g. a Flash-Lite model)",
  GEMINI_MODEL_REASONING: "aistudio.google.com model list",
  GEMINI_MODEL_VISION: "aistudio.google.com model list (any multimodal Flash model)",
  SIM_DONOR_EMAILS: "developer.paypal.com → Testing Tools → Sandbox Accounts → 3 US Personal accounts (comma-separated)",
  SIM_CLAIMANT_EMAILS: "developer.paypal.com → Testing Tools → Sandbox Accounts → 6 US Personal accounts (comma-separated)",
  GROQ_API_KEY: "console.groq.com → API Keys (free tier)",
  GROQ_VISION_MODEL: "console.groq.com/docs/vision → a model that accepts images",
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
      if (part && part.length >= 3) secrets.add(decodeURIComponent(part));
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

async function checkPayPal(env: Env): Promise<void> {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`HTTP ${res.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim());
  }
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Exactly one tiny generateContent call. No metadata probe, no retry (each request counts on the free tier). */
async function checkGemini(env: Env, model: string): Promise<void> {
  const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
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

async function main(): Promise<void> {
  const env = loadFile(".env");
  const example = loadFile(".env.example");
  const redact = makeRedactor(env);
  const isSet = (k: string) => Boolean(env[k]?.trim());
  const problems: string[] = [];

  console.log("\nRelief Stream — environment check (values are never printed)\n");
  if (!fs.existsSync(path.join(ROOT, ".env"))) {
    console.log(bad("No .env file. Copy .env.example to .env and fill it in."));
    process.exit(1);
  }

  console.log("Phase 1 required keys");
  for (const k of PHASE1_REQUIRED) {
    if (isSet(k)) console.log(`  ${ok("SET    ")} ${k}`);
    else {
      console.log(`  ${bad("MISSING")} ${k}  ${dim(WHERE[k] ? `→ ${WHERE[k]}` : "")}`);
      problems.push(`${k} is missing${WHERE[k] ? ` (get it: ${WHERE[k]})` : ""}`);
    }
  }
  console.log("\nPhase 1 optional");
  for (const k of PHASE1_OPTIONAL) {
    console.log(`  ${isSet(k) ? ok("SET    ") : dim("not set")} ${k}  ${dim("(optional in Phase 1)")}`);
  }

  const later = Object.keys(example).filter(
    (k) => !(PHASE1_REQUIRED as readonly string[]).includes(k) && !(PHASE1_OPTIONAL as readonly string[]).includes(k),
  );
  console.log("\nNeeded in Phase 2/3 (not an error now)");
  for (const k of later) console.log(`  ${isSet(k) ? ok("SET    ") : dim("not set")} ${k}`);

  // ---- sanity checks ----
  console.log("\nSanity checks");
  const num = (k: string) => Number(env[k]);
  const sanity: Array<[string, boolean]> = [
    [
      "weights add up to 100",
      ["WEIGHT_PHOTO", "WEIGHT_LOCATION", "WEIGHT_MESSAGE", "WEIGHT_UNIQUENESS", "WEIGHT_VOUCHING"].reduce((s, k) => s + num(k), 0) === 100,
    ],
    ["HUMAN_REVIEW_THRESHOLD < AUTO_PAYOUT_THRESHOLD", num("HUMAN_REVIEW_THRESHOLD") < num("AUTO_PAYOUT_THRESHOLD")],
    ["DEFAULT_PACKET_USD <= MAX_FIRST_PACKET_USD", num("DEFAULT_PACKET_USD") > 0 && num("DEFAULT_PACKET_USD") <= num("MAX_FIRST_PACKET_USD")],
    ["PAYPAL_API_BASE contains \"sandbox\"", (env.PAYPAL_API_BASE ?? "").includes("sandbox")],
    ["PAYPAL_ENVIRONMENT is sandbox", env.PAYPAL_ENVIRONMENT === "sandbox"],
    ["AI_DEMO_CACHE is on, off or empty", ["", "on", "off"].includes((env.AI_DEMO_CACHE ?? "").trim().toLowerCase())],
    ["AI_DEMO_CACHE is not on in production", !(env.NODE_ENV === "production" && (env.AI_DEMO_CACHE ?? "").trim().toLowerCase() === "on")],
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
  ];
  for (const [name, pass] of sanity) {
    console.log(`  ${pass ? ok("PASS") : bad("FAIL")} ${name}`);
    if (!pass) problems.push(`sanity check failed: ${name}`);
  }

  // ---- live checks ----
  console.log("\nLive checks");
  const live: Array<[string, string[], () => Promise<void>]> = [
    ["PayPal sandbox OAuth token", ["PAYPAL_API_BASE", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"], () => checkPayPal(env)],
    ["Gemini GEMINI_MODEL_VISION (1 call)", ["GEMINI_API_KEY", "GEMINI_MODEL_VISION"], () => checkGemini(env, env.GEMINI_MODEL_VISION!)],
    ["Postgres SELECT 1", ["DATABASE_URL"], () => checkDatabase(env)],
  ];
  const groqSet = isSet("GROQ_API_KEY") && isSet("GROQ_VISION_MODEL");
  if (groqSet) live.splice(2, 0, ["Groq GROQ_VISION_MODEL fallback (1 call)", ["GROQ_API_KEY", "GROQ_VISION_MODEL"], () => checkGroq(env, env.GROQ_VISION_MODEL!)]);
  else console.log(`  ${dim("SKIP")} Groq fallback ${dim("(GROQ_API_KEY / GROQ_VISION_MODEL not set: a Gemini quota error will send claims to review)")}`);
  for (const [name, needs, fn] of live) {
    if (!needs.every(isSet)) {
      console.log(`  ${bad("SKIP")} ${name} ${dim("(required key missing)")}`);
      continue;
    }
    try {
      await withTimeout(fn(), 45_000);
      console.log(`  ${ok("PASS")} ${name}`);
    } catch (e) {
      const msg = redact(e instanceof Error ? e.message : String(e));
      console.log(`  ${bad("FAIL")} ${name} — ${msg}`);
      problems.push(`${name} failed: ${msg}`);
    }
  }

  console.log("");
  if (problems.length) {
    console.log(bad(`check:env FAILED (${problems.length} problem${problems.length > 1 ? "s" : ""}):`));
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log(ok("check:env PASSED — Phase 1 can start."));
}

main().catch((e) => {
  console.error(bad("check:env crashed:"), e instanceof Error ? e.name : "error");
  process.exit(1);
});
