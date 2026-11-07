/**
 * npm run tunnel — a FREE public HTTPS URL for your local app (Cloudflare quick tunnel: no account, no card).
 * Use it for PayPal webhooks and for testing the PayPal button from a real https origin.
 * The URL is random and CHANGES every time you start the tunnel: re-register the webhook each time.
 * Keep this running in its own terminal (Ctrl+C stops it). The app must be running on :3000 (npm run dev:local).
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { bin, install, Tunnel } from "cloudflared";

const target = process.argv[2] ?? "http://localhost:3000";
// A download cut off half-way leaves a broken binary that the package would happily reuse: verify it.
const works = () => fs.existsSync(bin) && spawnSync(bin, ["--version"], { encoding: "utf8" }).status === 0;
for (let attempt = 1; !works(); attempt++) {
  if (attempt > 3) {
    console.error("Could not download cloudflared. Get it from https://github.com/cloudflare/cloudflared/releases and put it at " + bin);
    process.exit(1);
  }
  fs.rmSync(bin, { force: true });
  console.log(`Downloading the cloudflared binary (free, once; attempt ${attempt})…`);
  await install(bin).catch((e) => console.error(`download failed: ${e.message}`));
}

const tunnel = Tunnel.quick(target);
const url = await new Promise((resolve) => tunnel.once("url", resolve));
await new Promise((resolve) => tunnel.once("connected", resolve));

console.log(`
\x1b[32mTunnel up:\x1b[0m ${url}  →  ${target}

PayPal webhook (sandbox) — do this every time the tunnel URL changes:
  1. developer.paypal.com → Apps & Credentials → Sandbox → your Relief Stream app → Webhooks → Add Webhook
     (delete the old trycloudflare.com webhook first)
  2. Webhook URL:  ${url}/api/webhooks/paypal
  3. Event types:  Payment capture completed  (PAYMENT.CAPTURE.COMPLETED)
                   Payout item succeeded      (PAYMENT.PAYOUTS-ITEM.SUCCEEDED)
                   Payout item failed         (PAYMENT.PAYOUTS-ITEM.FAILED)
                   Payout item unclaimed      (PAYMENT.PAYOUTS-ITEM.UNCLAIMED)
  4. Save, copy the new Webhook ID into .env as PAYPAL_WEBHOOK_ID, and restart npm run dev:local.

PayPal button test: open ${url}/stream and donate with a US sandbox PERSONAL account (SIM_DONOR_EMAILS).
Ctrl+C stops the tunnel.`);

tunnel.on("exit", (code) => {
  console.log(`tunnel stopped (${code ?? 0})`);
  process.exit(code ?? 0);
});
process.on("SIGINT", () => tunnel.stop());
