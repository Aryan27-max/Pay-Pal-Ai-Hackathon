/**
 * npm run dev:local — start the local Docker stack (if this .env uses it), wait until it answers on the
 * host, then run the Next.js dev server on http://localhost:3000.
 * With a hosted DATABASE_URL (Neon, Supabase, ...) and no local ELASTIC_URL, Docker is not needed at all.
 */
import { spawn } from "node:child_process";
import { composeUp, dockerOk, localServices, readEnv, waitForStack } from "./local-stack.mjs";

const env = readEnv();
if (localServices(env).length) {
  if (!dockerOk()) {
    console.error("Docker is not running. Start Docker Desktop and re-run npm run dev:local (or point DATABASE_URL at a hosted Postgres and leave ELASTIC_URL empty: then Docker is not needed).");
    process.exit(1);
  }
  composeUp(env);
  await waitForStack(env);
}
const child = spawn("npx", ["next", "dev"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
