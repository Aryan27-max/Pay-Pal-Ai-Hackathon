#!/usr/bin/env node
/**
 * npm run secret-scan — before a commit: checks every STAGED file for any secret or private value from
 * .env (keys, tokens, URLs with credentials, sandbox emails, the database host). Prints only key NAMES
 * and file paths, never values. Exit 1 if anything is found or a forbidden file (.env, *.pem, .next/…) is staged.
 */
const fs = require("node:fs");
const cp = require("node:child_process");

const env = fs.existsSync(".env")
  ? Object.fromEntries(
      fs
        .readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
    )
  : {};

const SECRETISH = /KEY|SECRET|SALT|TOKEN|PASSWORD|DATABASE_URL|WEBHOOK_URL|CLIENT_ID|ELASTIC_URL|POOL_BUSINESS_EMAIL|WEBHOOK_ID/;
const values = Object.entries(env).filter(([k, v]) => v.length >= 12 && SECRETISH.test(k) && !/localhost|127\.0\.0\.1/.test(v));
for (const k of ["SIM_DONOR_EMAILS", "SIM_CLAIMANT_EMAILS"]) for (const e of (env[k] || "").split(",").map((s) => s.trim()).filter(Boolean)) values.push([`${k}[item]`, e]);
try {
  const u = new URL(env.DATABASE_URL);
  if (!/localhost|127\.0\.0\.1/.test(u.hostname)) values.push(["DATABASE_URL host", u.hostname]);
} catch {}

const files = cp.execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" }).split("\n").filter(Boolean);
const forbidden = files.filter((f) => /(^|\/)\.env($|\.local$|\.[^.]+\.local$)|\.pem$|\.bak$|^\.next\/|node_modules\/|graphify-out\/(cache|\.graphify)/.test(f));
let hits = 0;
for (const f of files) {
  let t;
  try {
    t = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const [k, v] of values) if (t.includes(v)) (hits++, console.log(`HIT ${k} in ${f}`));
}
for (const f of forbidden) console.log(`FORBIDDEN file staged: ${f}`);
console.log(`secret-scan: ${values.length} values × ${files.length} staged files → ${hits} hits, ${forbidden.length} forbidden files`);
process.exit(hits || forbidden.length ? 1 : 0);
