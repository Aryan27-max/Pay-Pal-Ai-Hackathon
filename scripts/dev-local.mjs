/**
 * npm run dev:local — start the local Docker stack (if this .env uses it), wait until it answers on the
 * host, then run the Next.js dev server on http://localhost:3000.
 */
import { spawn } from "node:child_process";
import { composeUp, dockerOk, readEnv, waitForStack } from "./local-stack.mjs";

const env = readEnv();
if (!dockerOk()) {
  console.error("Docker is not running. Start Docker Desktop and re-run npm run dev:local.");
  process.exit(1);
}
composeUp(env);
await waitForStack(env);
const child = spawn("npx", ["next", "dev"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
