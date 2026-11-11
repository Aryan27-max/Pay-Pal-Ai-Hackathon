/**
 * Shared helpers for the local Docker stack (used by setup.mjs and dev-local.mjs). Cross-platform Node.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

export const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });

export function readEnv() {
  if (!fs.existsSync(".env")) return {};
  return Object.fromEntries(
    fs
      .readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
}

export function dockerOk() {
  try {
    execSync("docker info --format {{.ServerVersion}}", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function tcpOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => (s.end(), resolve(true)));
    s.on("error", () => resolve(false));
    s.setTimeout(2000, () => (s.destroy(), resolve(false)));
  });
}

const LOCAL_PG = /@(localhost|127\.0\.0\.1):5433\//;
const LOCAL_ES = /^http:\/\/(localhost|127\.0\.0\.1)/;

/** The Docker containers this .env needs. Empty = hosted Postgres (Neon, Supabase, ...) and no local Elasticsearch: no Docker at all. */
export function localServices(env) {
  const services = [];
  if (LOCAL_PG.test(env.DATABASE_URL ?? "")) services.push("postgres");
  if (LOCAL_ES.test(env.ELASTIC_URL ?? "")) services.push("elasticsearch");
  return services;
}

/** Docker Desktop's port forward can lag the container healthcheck by a few seconds: wait for the host side. */
export async function waitForStack(env, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  const needs = localServices(env);
  const useLocalEs = needs.includes("elasticsearch");
  for (;;) {
    const pg = !needs.includes("postgres") || (await tcpOpen(5433));
    let es = !useLocalEs;
    if (useLocalEs) {
      try {
        es = (await fetch(env.ELASTIC_URL, { signal: AbortSignal.timeout(3000) })).ok;
      } catch {
        es = false;
      }
    }
    if (pg && es) return;
    if (Date.now() > deadline) throw new Error(`local stack not reachable (postgres ${pg ? "up" : "down"}, elasticsearch ${es ? "up" : "down"})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Start the containers this .env needs (Postgres if DATABASE_URL is local, Elasticsearch if ELASTIC_URL is local). */
export function composeUp(env) {
  const services = localServices(env);
  if (!services.length) return [];
  run(`docker compose up -d --wait ${services.join(" ")}`);
  return services;
}
