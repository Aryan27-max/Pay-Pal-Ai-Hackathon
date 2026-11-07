import { z } from "zod";

/** Gemini output contract — architecture.md §5. Validated with zod; invalid → retry once → IN_REVIEW. */
export const AiAssessmentSchema = z.object({
  photo_matches_disaster: z.number().min(0).max(1),
  photo_ai_generated_risk: z.number().min(0).max(1),
  message_consistency: z.number().min(0).max(1),
  language_detected: z.string().min(2).max(16),
  red_flags: z.array(z.string().max(300)).max(20),
  explanation: z.string().min(1).max(1500),
});

export type AiAssessment = z.infer<typeof AiAssessmentSchema>;

/** JSON Schema sent to Gemini as responseJsonSchema (kept in sync with the zod schema above). */
export const AI_ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    photo_matches_disaster: { type: "number", minimum: 0, maximum: 1 },
    photo_ai_generated_risk: { type: "number", minimum: 0, maximum: 1 },
    message_consistency: { type: "number", minimum: 0, maximum: 1 },
    language_detected: { type: "string", description: "ISO 639-1 code of the claimant message" },
    red_flags: { type: "array", items: { type: "string" } },
    explanation: { type: "string", description: "One short paragraph a reviewer can read." },
  },
  required: [
    "photo_matches_disaster",
    "photo_ai_generated_risk",
    "message_consistency",
    "language_detected",
    "red_flags",
    "explanation",
  ],
} as const;

/** Parse raw model text into the contract. Returns null on any problem. */
export function parseAssessment(raw: string | undefined | null): AiAssessment | null {
  if (!raw) return null;
  // Some open models (e.g. Qwen on Groq) may prefix a <think>…</think> block; drop it, then any fences.
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const r = AiAssessmentSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/* ---------------- Gemini error classification (pure) ---------------- */

export type AiErrorKind = "quota_exhausted" | "rate_limited" | "unavailable" | "other";
export type AiErrorClass = { kind: AiErrorKind; retryAfterMs?: number };

/** Longest wait we accept inline for a per-minute limit; anything longer is treated as exhausted. */
export const MAX_INLINE_RETRY_MS = 60_000;

/**
 * Classify a Gemini API error message so the wrapper retries only what can succeed soon:
 *  - per-day quota (or a retryDelay longer than a minute) → quota_exhausted: never retry inline
 *  - other 429 / RESOURCE_EXHAUSTED → rate_limited: wait retryDelay (if given) and retry
 *  - 500 / 503 / UNAVAILABLE / DEADLINE_EXCEEDED / timeouts → unavailable: back off and retry
 */
/** Short, key-free reason: kind + HTTP status + quota ids + retryDelay, for reviewers and logs. */
export function describeAiError(message: string): string {
  const m = message ?? "";
  const cls = classifyAiError(m);
  const code = /"code"\s*:\s*(\d{3})/.exec(m)?.[1];
  const status = /"status"\s*:\s*"([A-Z_]+)"/.exec(m)?.[1];
  const quotas = [...new Set([...m.matchAll(/"quotaId"\s*:\s*"([A-Za-z0-9_-]+)"/g)].map((x) => x[1]))];
  const limits = [...m.matchAll(/"quotaValue"\s*:\s*"(\d+)"/g)].map((x) => x[1]);
  const delay = /"retryDelay"\s*:\s*"([\d.]+s)"/.exec(m)?.[1];
  const parts = [cls.kind, code && `HTTP ${code}`, status, quotas.length && `quota ${quotas.join(",")}${limits.length ? ` (limit ${limits.join(",")})` : ""}`, delay && `retryDelay ${delay}`].filter(Boolean);
  return code || status ? parts.join(" | ") : `${cls.kind}: ${m.slice(0, 200)}`;
}

export function classifyAiError(message: string): AiErrorClass {
  const m = message ?? "";
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(m)?.[1];
  const retryAfterMs = delay !== undefined ? Math.round(Number(delay) * 1000) : undefined;
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)) {
    if (/PerDay|per day|daily/i.test(m) || (retryAfterMs !== undefined && retryAfterMs > MAX_INLINE_RETRY_MS)) return { kind: "quota_exhausted", retryAfterMs };
    return { kind: "rate_limited", retryAfterMs };
  }
  if (/\b(500|502|503|504)\b|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|aborted|AbortError/i.test(m)) return { kind: "unavailable" };
  return { kind: "other" };
}
