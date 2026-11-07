import { z } from "zod";

/**
 * Server-side configuration, validated once with zod.
 * Never log the returned object: it holds secrets.
 */
const num = z.coerce.number().finite();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.string().url(),
    CLAIM_ID_SALT: z.string().min(32),
    REVIEWER_ACCESS_TOKEN: z.string().min(16),

    AUTO_PAYOUT_THRESHOLD: num.int().min(0).max(100),
    HUMAN_REVIEW_THRESHOLD: num.int().min(0).max(100),
    DEFAULT_PACKET_USD: num.positive(),
    MAX_FIRST_PACKET_USD: num.positive(),
    WEIGHT_PHOTO: num.min(0),
    WEIGHT_LOCATION: num.min(0),
    WEIGHT_MESSAGE: num.min(0),
    WEIGHT_UNIQUENESS: num.min(0),
    WEIGHT_VOUCHING: num.min(0),

    DATABASE_URL: z.string().min(1),

    PAYPAL_ENVIRONMENT: z.literal("sandbox"),
    PAYPAL_API_BASE: z.string().url().refine((u) => u.includes("sandbox"), "PAYPAL_API_BASE must be the sandbox host"),
    PAYPAL_CLIENT_ID: z.string().min(1),
    PAYPAL_CLIENT_SECRET: z.string().min(1),
    PAYPAL_WEBHOOK_ID: z.string().optional().default(""),
    PAYPAL_POOL_BUSINESS_EMAIL: z.string().email(),

    GEMINI_API_KEY: z.string().min(1),
    GEMINI_MODEL_FAST: z.string().min(1),
    GEMINI_MODEL_REASONING: z.string().min(1),
    GEMINI_MODEL_VISION: z.string().min(1),
    // Groq vision fallback (optional: without it a Gemini quota error sends the claim to review).
    GROQ_API_KEY: z.string().optional().default(""),
    GROQ_VISION_MODEL: z.string().optional().default(""),
    // on | off | empty (= on in development, off in production). See lib/ai/demo-cache.ts.
    AI_DEMO_CACHE: z.enum(["on", "off", ""]).optional().default(""),

    // ---- Phase 2 (all optional here so unit tests and local runs need no cloud keys; check:env enforces them) ----
    WHISPER_MODE: z.enum(["groq", "local"]).optional().default("groq"),
    GROQ_WHISPER_MODEL: z.string().optional().default("whisper-large-v3-turbo"),
    WHISPER_LOCAL_MODEL: z.string().optional().default("base"),
    CLIP_MODE: z.literal("local").optional().default("local"),
    CLIP_MODEL_ID: z.string().optional().default("Xenova/clip-vit-base-patch32"),
    CLIP_DTYPE: z.enum(["q8", "q4", ""]).optional().default(""),
    ELASTIC_URL: z.string().optional().default(""),
    ELASTIC_API_KEY: z.string().optional().default(""),
    ELASTIC_CLAIMS_INDEX: z.string().optional().default("relief-claims"),
    ELASTIC_PHOTOS_INDEX: z.string().optional().default("relief-photos"),
    GDACS_FEED_URL: z.string().optional().default("https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=FL;TC;EQ;WF;VO"),
    USGS_FEED_URL: z.string().optional().default("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"),
    // on | off | empty (= on). The clearly labelled SIMULATED demo event (simulators/fixtures/flood-zone.json).
    SIMULATED_EVENT: z.enum(["on", "off", ""]).optional().default(""),
    KERNEL_API_KEY: z.string().optional().default(""),
    // on | off | empty (= on when KERNEL_API_KEY is set). Optional alert-page corroboration.
    KERNEL_CHECK: z.enum(["on", "off", ""]).optional().default(""),
    ZAPIER_REVIEW_WEBHOOK_URL: z.string().optional().default(""),
    ZAPIER_ALERT_WEBHOOK_URL: z.string().optional().default(""),
    POOL_LOW_USD: num.min(0).optional().default(100),
    RENDER_API_KEY: z.string().optional().default(""),
    RENDER_WORKFLOW_SERVICE_ID: z.string().optional().default(""),
    RENDER_WORKFLOW_SLUG: z.string().optional().default(""),

    SIM_DONOR_EMAILS: z.string().optional().default(""),
    SIM_CLAIMANT_EMAILS: z.string().optional().default(""),
  })
  .refine((e) => e.HUMAN_REVIEW_THRESHOLD < e.AUTO_PAYOUT_THRESHOLD, "HUMAN_REVIEW_THRESHOLD must be < AUTO_PAYOUT_THRESHOLD")
  .refine((e) => e.DEFAULT_PACKET_USD <= e.MAX_FIRST_PACKET_USD, "DEFAULT_PACKET_USD must be <= MAX_FIRST_PACKET_USD");

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only report key names, never values.
    const keys = parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ");
    throw new Error(`Invalid environment configuration: ${keys}. Run npm run check:env.`);
  }
  cached = parsed.data;
  return cached;
}
