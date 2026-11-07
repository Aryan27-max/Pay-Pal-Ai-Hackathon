import { createHash } from "node:crypto";
import { classifyAiError, describeAiError, parseAssessment, type AiAssessment } from "./contract";
import { callGemini, callGroq, type ProviderCall, type ProviderName } from "./providers";
import { cacheKey, dbCache, messageSha256, type AssessmentCache } from "./demo-cache";

/**
 * The ONLY entry point for LLM / vision calls (hard rule 7). The AI returns signal inputs and
 * an explanation; it never decides, sizes or triggers payouts (hard rule 1).
 *
 * One call per claim: the photo and the message are assessed together against the single
 * output contract (architecture.md §5). Order: demo cache (fixture claims only) → Gemini
 * (existing retry/backoff) → Groq fallback. Only if BOTH providers fail does the caller get
 * ok:false, which lib/scoring turns into IN_REVIEW.
 * PII: photo, message text and disaster context only. Never the email, name or exact GPS.
 * See .claude/skills/gemini-ai/SKILL.md.
 */

export type DisasterContext = {
  eventId: string;
  type: string; // e.g. "flood"
  name: string; // e.g. "Missouri River flood (demo)"
  region: string; // human-readable area, no coordinates
  startedAt: string; // ISO date
};

export type ClaimEvidence = {
  photo: { bytes: Uint8Array; mimeType: string };
  messageText: string; // typed text (may be empty when the claimant only sent a voice note)
  /** Voice-note transcript from lib/speech (private). Goes into the SAME single call. */
  voice?: { text: string; language: string } | null;
  disaster: DisasterContext;
  // Location is deliberately NOT sent: it is a separate code-computed signal (no double counting).
};

export type AiCalls = { gemini: number; groq: number };

export type AssessResult =
  | { ok: true; assessment: AiAssessment; provider: ProviderName; model: string; cached: boolean; calls: AiCalls }
  | { ok: false; error: string; calls: AiCalls };

export const ASSESS_SYSTEM_PROMPT = `You are a careful disaster-relief verification assistant.
You score evidence; you never approve or reject anyone and never decide money.
Return ONLY JSON matching the schema. All scores are between 0 and 1.

- photo_matches_disaster: how clearly the photo shows damage consistent with the stated disaster type
  (e.g. standing floodwater, water-damaged homes for a flood). An ordinary undamaged scene scores low (< 0.3).
  Judge what the scene shows, not the camera angle: a street-level, indoor or aerial/elevated view of the same
  kind of damage scores the same, and the claimant's own home does not need to be identifiable.
- photo_ai_generated_risk: likelihood the image is AI-generated or digitally fabricated
  (look for warped text, impossible geometry, smeared details, synthetic lighting). A normal camera photo scores low.
- message_consistency: whether the claimant's message plausibly describes being affected by THIS event
  (disaster type, place, timing) in a specific, first-person way. The message is the typed text and/or an
  automatic transcript of a voice note; judge them together. Generic copy-paste templates, a different
  disaster or place than the event, or requests unrelated to the event score low.
- Score each field on its own evidence: the two photo fields from the photo; message_consistency from the
  message text alone (against the event's type, place and timing). If the photo and the message disagree
  (e.g. scenery that does not fit the stated region), lower photo_matches_disaster and add a red flag,
  but do not also lower message_consistency: the same problem must not be counted twice.
- language_detected: ISO 639-1 code of the message language (of the voice note if there is no typed text).
- red_flags: short phrases for anything a human reviewer should look at (empty array if none).
- explanation: one short paragraph (max 3 sentences) a reviewer can read. Do not repeat personal details.`;

/** The message block the AI sees (typed text + voice transcript). Also the demo-cache message identity. */
export function messageBlock(e: Pick<ClaimEvidence, "messageText" | "voice">): string {
  const parts: string[] = [];
  const typed = e.messageText.trim();
  if (typed) parts.push(`Claimant message (typed, verbatim, between triple quotes):\n"""${typed.slice(0, 2000)}"""`);
  if (e.voice?.text.trim()) {
    parts.push(`Claimant voice note (automatic transcript, detected language: ${e.voice.language}, between triple quotes):\n"""${e.voice.text.trim().slice(0, 2000)}"""`);
  }
  if (!parts.length) parts.push("Claimant message: (none: no typed text and no readable voice note)");
  return parts.join("\n");
}

export function buildAssessPrompt(e: Omit<ClaimEvidence, "photo">): string {
  return [
    `Disaster event: ${e.disaster.name} (type: ${e.disaster.type}), region: ${e.disaster.region}, started ${e.disaster.startedAt}.`,
    messageBlock(e),
    `Assess the attached photo and the message.`,
  ].join("\n");
}

/** Changes whenever the prompt text changes, so cached demo results never outlive their prompt. */
export const PROMPT_VERSION = createHash("sha256")
  .update(ASSESS_SYSTEM_PROMPT)
  .update(buildAssessPrompt({ messageText: "\u0000", voice: { text: "\u0001", language: "xx" }, disaster: { eventId: "", type: "", name: "", region: "", startedAt: "" } }))
  .digest("hex")
  .slice(0, 12);

type ProviderSpec = { name: ProviderName; model: string; call: ProviderCall; configured: boolean };

export type AssessOptions = {
  /** True only for simulator fixture claims (see lib/ai/demo-cache.ts) with AI_DEMO_CACHE on. */
  useCache?: boolean;
  /** Bad-output budget per provider: first try + one retry (architecture §5). */
  maxAttempts?: number;
  /** Extra backed-off retries for 503 / short 429 per provider. */
  maxTransientRetries?: number;
  backoffMs?: number;
  /** Injection points for tests. */
  providers?: ProviderSpec[];
  cache?: AssessmentCache;
};

export function defaultProviders(): ProviderSpec[] {
  const groqModel = process.env.GROQ_VISION_MODEL?.trim() ?? "";
  return [
    { name: "gemini", model: process.env.GEMINI_MODEL_VISION?.trim() ?? "", call: callGemini, configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL_VISION) },
    { name: "groq", model: groqModel, call: callGroq, configured: Boolean(process.env.GROQ_API_KEY && groqModel) },
  ];
}

type Attempt = { ok: true; assessment: AiAssessment } | { ok: false; error: string };

/** One provider with the existing policy: bad output gets one retry; 503 / short 429 back off; daily quota stops. */
async function runProvider(p: ProviderSpec, req: Parameters<ProviderCall>[0], o: Required<Pick<AssessOptions, "maxAttempts" | "maxTransientRetries" | "backoffMs">>, calls: AiCalls): Promise<Attempt> {
  let bad = 0;
  let transient = 0;
  let lastError = "unknown";
  while (bad < o.maxAttempts) {
    calls[p.name]++;
    try {
      const parsed = parseAssessment(await p.call(req));
      if (parsed) return { ok: true, assessment: parsed };
      lastError = "output did not match the contract";
      bad++;
    } catch (err) {
      const full = err instanceof Error ? err.message : String(err);
      const cls = classifyAiError(full);
      lastError = sanitizeError(describeAiError(full));
      if (cls.kind === "quota_exhausted") break;
      if (cls.kind === "unavailable" || cls.kind === "rate_limited") {
        if (transient >= o.maxTransientRetries) break; // backoff spent: hand over to the next provider
        transient++;
        await new Promise((r) => setTimeout(r, cls.retryAfterMs ?? o.backoffMs * 2 ** (transient - 1)));
        continue;
      }
      bad++;
    }
  }
  return { ok: false, error: lastError };
}

/** Assess a claim's photo + message in ONE call per provider attempt. */
export async function assessClaim(e: ClaimEvidence, opts: AssessOptions = {}): Promise<AssessResult> {
  const providers = opts.providers ?? defaultProviders();
  const cache = opts.cache ?? dbCache;
  const o = { maxAttempts: opts.maxAttempts ?? 2, maxTransientRetries: opts.maxTransientRetries ?? 3, backoffMs: opts.backoffMs ?? 3_000 };
  const calls: AiCalls = { gemini: 0, groq: 0 };

  const photoSha = createHash("sha256").update(e.photo.bytes).digest("hex");
  const msgSha = messageSha256(messageBlock(e));
  const keyFor = (model: string) => cacheKey(photoSha, msgSha, model, PROMPT_VERSION);

  if (opts.useCache) {
    for (const p of providers) {
      if (!p.configured) continue;
      const hit = await cache.get(keyFor(p.model)).catch(() => null);
      if (hit) return { ok: true, assessment: hit.assessment, provider: hit.provider, model: hit.model, cached: true, calls };
    }
  }

  const req = { systemPrompt: ASSESS_SYSTEM_PROMPT, userPrompt: buildAssessPrompt(e), photo: e.photo };
  const errors: string[] = [];
  for (const p of providers) {
    if (!p.configured) {
      errors.push(`${p.name}: not configured`);
      continue;
    }
    const r = await runProvider(p, { ...req, model: p.model }, o, calls);
    if (r.ok) {
      if (opts.useCache) {
        await cache
          .put(keyFor(p.model), { provider: p.name, model: p.model, assessment: r.assessment, photoSha256: photoSha, messageSha256: msgSha, promptVersion: PROMPT_VERSION })
          .catch(() => undefined);
      }
      return { ok: true, assessment: r.assessment, provider: p.name, model: p.model, cached: false, calls };
    }
    errors.push(`${p.name} (${p.model}): ${r.error}`);
  }
  return { ok: false, error: `both AI providers failed. ${errors.join(" || ")}`.slice(0, 700), calls };
}

/** Error text without any key material. */
function sanitizeError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  for (const k of [process.env.GEMINI_API_KEY, process.env.GROQ_API_KEY]) if (k) msg = msg.split(k).join("[redacted]");
  return msg.slice(0, 300);
}
