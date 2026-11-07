/**
 * Optional services and what switching each one off does (pure: takes an env-like object).
 * The app runs with ONLY the core keys (PayPal sandbox, Gemini, Postgres). Every service below switches
 * off cleanly and shows "disabled: no key" on /admin and in check:env, with its effect on the score.
 * Single source of truth for check:env, /admin, architecture.md §5 and the README.
 */
export type EnvLike = Record<string, string | undefined>;

export type ServiceId = "groq" | "elastic" | "kernel" | "zapier" | "solana" | "paypal_webhook";

export type ServiceDef = {
  id: ServiceId;
  name: string;
  phase: 2 | 3;
  keys: string[]; // all must be set for the service to be on
  whenOff: string; // effect on scoring / the product when disabled
};

export const SERVICES: ServiceDef[] = [
  {
    id: "groq",
    name: "Groq (vision fallback + Whisper)",
    phase: 2,
    keys: ["GROQ_API_KEY", "GROQ_VISION_MODEL", "GROQ_WHISPER_MODEL"],
    whenOff:
      "No AI fallback: if Gemini fails or hits its daily budget the claim goes to IN_REVIEW (never auto-paid, never auto-rejected). Voice notes can't be transcribed: typed text still scores; a voice-only claim gets message 0 and goes to review.",
  },
  {
    id: "elastic",
    name: "Elasticsearch (CLIP near-duplicates, vouching)",
    phase: 2,
    keys: ["ELASTIC_URL"],
    whenOff:
      "CLIP near-duplicate search is off; the perceptual hash in Postgres still catches resized / re-compressed / brightened copies, but a heavy crop may pass. Vouching uses a Postgres distance query instead. Scores are otherwise unchanged.",
  },
  {
    id: "kernel",
    name: "Kernel (official alert page)",
    phase: 2,
    keys: ["KERNEL_API_KEY"],
    whenOff: "Location uses the GDACS/USGS feeds (and the SIMULATED event) only. Kernel can only raise location, so no claim scores lower than it should.",
  },
  {
    id: "zapier",
    name: "Zapier (review + ops alerts)",
    phase: 2,
    keys: ["ZAPIER_REVIEW_WEBHOOK_URL", "ZAPIER_ALERT_WEBHOOK_URL"],
    whenOff: "No Slack/email alerts. Reviewers use the /review queue; ops problems (pool low, payout failed, AI down) still show on /admin. Scoring unchanged.",
  },
  {
    id: "paypal_webhook",
    name: "PayPal webhook signature (PAYPAL_WEBHOOK_ID)",
    phase: 2,
    keys: ["PAYPAL_WEBHOOK_ID"],
    whenOff: "Webhooks are not signature-verified; the app re-fetches each event's resource from PayPal before acting. Payout polling still settles payouts.",
  },
  {
    id: "solana",
    name: "Solana devnet trail (test PYUSD + Memo)",
    phase: 3,
    keys: ["SOLANA_RPC_URL", "SOLANA_TRAIL_WALLET_SECRET_KEY", "PYUSD_DEVNET_MINT", "SOLANA_EXPLORER_BASE"],
    whenOff: "No public on-chain record. Decisions and payouts are unaffected; dashboard and receipts show 'trail disabled' instead of explorer links.",
  },
];

export type ServiceStatus = ServiceDef & { enabled: boolean; missing: string[] };

const isSet = (env: EnvLike, k: string) => Boolean(env[k]?.trim());

export function serviceStatuses(env: EnvLike): ServiceStatus[] {
  return SERVICES.map((s) => {
    const missing = s.keys.filter((k) => !isSet(env, k));
    return { ...s, enabled: missing.length === 0, missing };
  });
}

export function serviceEnabled(env: EnvLike, id: ServiceId): boolean {
  return serviceStatuses(env).find((s) => s.id === id)!.enabled;
}
