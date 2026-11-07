import { describe, expect, it, vi } from "vitest";

// lib/ai/demo-cache imports the Prisma client; these tests inject their own cache, so stub it.
vi.mock("@/lib/db", () => ({ db: {} }));

import { assessClaim, PROMPT_VERSION, type ClaimEvidence } from "@/lib/ai";
import { classifyAiError } from "@/lib/ai/contract";
import { cacheKey, demoCacheEnabled, messageSha256, type AssessmentCache, type CachedAssessment } from "@/lib/ai/demo-cache";
import { buildGroqBody, groqErrorText, type ProviderCall } from "@/lib/ai/providers";

const GOOD = JSON.stringify({
  photo_matches_disaster: 0.9,
  photo_ai_generated_risk: 0.05,
  message_consistency: 0.85,
  language_detected: "en",
  red_flags: [],
  explanation: "Floodwater inside a home; message matches the event.",
});
const DAILY_429 =
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"500"}]},{"retryDelay":"9000s"}]}}';
const OVERLOADED = '{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}';

const evidence: ClaimEvidence = {
  photo: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
  messageText: "Water came into our house in St. Charles on Tuesday.",
  disaster: { eventId: "e", type: "flood", name: "Missouri River flood (demo)", region: "St. Charles", startedAt: "2026-11-03" },
};

function memCache(): AssessmentCache & { store: Map<string, CachedAssessment> } {
  const store = new Map<string, CachedAssessment>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, { provider: v.provider, model: v.model, assessment: v.assessment }),
  };
}

function providers(gemini: ProviderCall, groq: ProviderCall, groqConfigured = true) {
  return [
    { name: "gemini" as const, model: "gemini-test-lite", call: vi.fn(gemini), configured: true },
    { name: "groq" as const, model: "groq-vision-test", call: vi.fn(groq), configured: groqConfigured },
  ];
}
const unlimited = { reserve: async () => true };
const fast = { backoffMs: 1, budget: unlimited };

/** In-memory budget: n calls per provider. */
function capped(n: Record<"gemini" | "groq", number>) {
  const used = { gemini: 0, groq: 0 };
  return { used, reserve: async (p: "gemini" | "groq") => (used[p] < n[p] ? (used[p]++, true) : false) };
}

describe("assessClaim: one call per claim, Gemini first", () => {
  it("a healthy Gemini answers with exactly one call and Groq is never touched", async () => {
    const p = providers(async () => GOOD, async () => GOOD);
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r).toMatchObject({ ok: true, provider: "gemini", model: "gemini-test-lite", cached: false, calls: { gemini: 1, groq: 0 } });
    expect(p[1]!.call).not.toHaveBeenCalled();
  });

  it("the photo and the message travel in the same single request", async () => {
    const p = providers(async () => GOOD, async () => GOOD);
    await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    const req = p[0]!.call.mock.calls[0]![0];
    expect(req.photo.bytes).toEqual(evidence.photo.bytes);
    expect(req.userPrompt).toContain(evidence.messageText);
  });
});

describe("assessClaim: Groq fallback", () => {
  it("a Gemini daily quota (429) goes straight to Groq without retrying Gemini", async () => {
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => GOOD);
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r).toMatchObject({ ok: true, provider: "groq", model: "groq-vision-test", calls: { gemini: 1, groq: 1 } });
  });

  it("a Gemini 503 is backed off 3 times first, then Groq answers", async () => {
    const p = providers(async () => { throw new Error(OVERLOADED); }, async () => GOOD);
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r).toMatchObject({ ok: true, provider: "groq", calls: { gemini: 4, groq: 1 } });
  });

  it("only when BOTH fail is the result ok:false, and the reason names both providers", async () => {
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => { throw new Error(groqErrorText(429, { error: { message: "Rate limit reached on requests per day (RPD)", type: "requests", code: "rate_limit_exceeded" } }, "4000")); });
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^both AI providers failed/);
    expect(r.error).toContain("gemini (gemini-test-lite): quota_exhausted | HTTP 429");
    expect(r.error).toContain("groq (groq-vision-test): quota_exhausted | HTTP 429");
    expect(r.calls).toEqual({ gemini: 1, groq: 1 });
  });

  it("Groq output is held to the same zod contract (bad JSON twice = failure)", async () => {
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => '{"photo_matches_disaster": 7}');
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r).toMatchObject({ ok: false, calls: { gemini: 1, groq: 2 } });
  });

  it("a Qwen-style <think> block before the JSON is tolerated", async () => {
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => `<think>looking at the photo</think>\n${GOOD}`);
    expect((await assessClaim(evidence, { providers: p, cache: memCache(), ...fast })).ok).toBe(true);
  });

  it("without Groq configured the failure says so", async () => {
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => GOOD, false);
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), ...fast });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("groq: not configured");
    expect(p[1]!.call).not.toHaveBeenCalled();
  });
});

describe("assessClaim: demo cache", () => {
  it("useCache: first claim calls the AI and stores it; the second is a cache hit with 0 calls", async () => {
    const cache = memCache();
    const p = providers(async () => GOOD, async () => GOOD);
    const first = await assessClaim(evidence, { providers: p, cache, useCache: true, ...fast });
    const second = await assessClaim(evidence, { providers: p, cache, useCache: true, ...fast });
    expect(first).toMatchObject({ ok: true, cached: false, calls: { gemini: 1, groq: 0 } });
    expect(second).toMatchObject({ ok: true, cached: true, provider: "gemini", calls: { gemini: 0, groq: 0 } });
    expect(cache.store.size).toBe(1);
  });

  it("without useCache (every real claim) the AI is always called and nothing is stored", async () => {
    const cache = memCache();
    const p = providers(async () => GOOD, async () => GOOD);
    await assessClaim(evidence, { providers: p, cache, ...fast });
    await assessClaim(evidence, { providers: p, cache, ...fast });
    expect(p[0]!.call).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(0);
  });

  it("failures are never cached", async () => {
    const cache = memCache();
    const p = providers(async () => { throw new Error(DAILY_429); }, async () => "nope");
    await assessClaim(evidence, { providers: p, cache, useCache: true, ...fast });
    expect(cache.store.size).toBe(0);
  });

  it("the key changes with the photo, the message, the model and the prompt version", () => {
    const base = cacheKey("p", messageSha256("m"), "model-a", PROMPT_VERSION);
    expect(cacheKey("p2", messageSha256("m"), "model-a", PROMPT_VERSION)).not.toBe(base);
    expect(cacheKey("p", messageSha256("m2"), "model-a", PROMPT_VERSION)).not.toBe(base);
    expect(cacheKey("p", messageSha256("m"), "model-b", PROMPT_VERSION)).not.toBe(base);
    expect(cacheKey("p", messageSha256("m"), "model-a", "other-prompt")).not.toBe(base);
  });

  it("AI_DEMO_CACHE: on/off win; empty = on in development, off in production", () => {
    expect(demoCacheEnabled("", "development")).toBe(true);
    expect(demoCacheEnabled(undefined, "production")).toBe(false);
    expect(demoCacheEnabled("off", "development")).toBe(false);
    expect(demoCacheEnabled("on", "production")).toBe(true);
  });
});

describe("assessClaim: daily call budget (cost guard)", () => {
  it("at the Gemini budget no Gemini call is made and Groq answers", async () => {
    const p = providers(async () => GOOD, async () => GOOD);
    const budget = capped({ gemini: 0, groq: 5 });
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), backoffMs: 1, budget });
    expect(r).toMatchObject({ ok: true, provider: "groq", calls: { gemini: 0, groq: 1 } });
    expect(p[0]!.call).not.toHaveBeenCalled();
  });
  it("both budgets used up → ok:false with a clear reason, zero calls", async () => {
    const p = providers(async () => GOOD, async () => GOOD);
    const r = await assessClaim(evidence, { providers: p, cache: memCache(), backoffMs: 1, budget: capped({ gemini: 0, groq: 0 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/gemini .*daily call budget reached/);
      expect(r.error).toMatch(/groq .*daily call budget reached/);
      expect(r.calls).toEqual({ gemini: 0, groq: 0 });
    }
  });
  it("a retry also needs budget: the budget is never overshot", async () => {
    const budget = capped({ gemini: 1, groq: 0 });
    const p = providers(async () => "not json", async () => GOOD);
    await assessClaim(evidence, { providers: p, cache: memCache(), backoffMs: 1, budget });
    expect(budget.used.gemini).toBe(1);
    expect(p[0]!.call).toHaveBeenCalledTimes(1);
  });
  it("defaults are 400 (Gemini) and 800 (Groq); env overrides", async () => {
    const { dailyBudget } = await import("@/lib/ai/budget");
    expect(dailyBudget("gemini", {})).toBe(400);
    expect(dailyBudget("groq", {})).toBe(800);
    expect(dailyBudget("gemini", { AI_DAILY_CALL_BUDGET_GEMINI: "25" })).toBe(25);
    expect(dailyBudget("groq", { AI_DAILY_CALL_BUDGET_GROQ: "nonsense" })).toBe(800);
  });
});

describe("Groq request + errors", () => {
  it("body matches the documented vision + JSON-mode shape (text part + base64 image_url)", () => {
    const b = buildGroqBody({ model: "groq-vision-test", systemPrompt: "SYS", userPrompt: "USER", photo: evidence.photo }) as {
      response_format: unknown;
      messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    };
    expect(b.response_format).toEqual({ type: "json_object" });
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0]!.role).toBe("user");
    expect(b.messages[0]!.content.map((c) => c.type)).toEqual(["text", "image_url"]);
    expect(b.messages[0]!.content[0]!.text).toMatch(/SYS[\s\S]*JSON[\s\S]*USER/);
    expect(b.messages[0]!.content[1]!.image_url!.url).toBe("data:image/jpeg;base64,AQID");
  });

  it("Groq 429 / 5xx map onto the shared classifier", () => {
    expect(classifyAiError(groqErrorText(429, { error: { message: "Rate limit reached ... requests per minute", code: "rate_limit_exceeded" } }, "7")))
      .toEqual({ kind: "rate_limited", retryAfterMs: 7000 });
    expect(classifyAiError(groqErrorText(429, { error: { message: "Rate limit reached on requests per day (RPD)" } }, "120")).kind).toBe("quota_exhausted");
    expect(classifyAiError(groqErrorText(503, { error: { message: "over capacity" } }, null)).kind).toBe("unavailable");
  });
});
