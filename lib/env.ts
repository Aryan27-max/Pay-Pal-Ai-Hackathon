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
