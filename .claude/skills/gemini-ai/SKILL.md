---
name: gemini-ai
description: Use for any LLM or vision call (Gemini, Groq fallback) — the single lib/ai wrapper, prompts, the JSON output contract, retries, fallback, demo cache and PII limits.
---

# gemini-ai

## Purpose
`lib/ai` is the only place that talks to an LLM (hard rule 7). **One call per claim**: Gemini (or Groq as a fallback) turns a photo and a message into **signal inputs and an explanation**. It never decides or moves money.

## Files it owns
- `lib/ai/index.ts`: `assessClaim()`, system prompt, prompt builder, `PROMPT_VERSION`, retry + provider fallback
- `lib/ai/providers.ts`: `callGemini` (45 s timeout), `callGroq`, `buildGroqBody`, `groqErrorText`
- `lib/ai/demo-cache.ts`: `demoCacheEnabled`, `isFixtureClaim`, `cacheKey`, Postgres `dbCache` (table `ai_cache`)
- `tests/ai-fallback.test.ts`, `tests/ai-errors.test.ts`
- `lib/ai/contract.ts`: zod `AiAssessmentSchema`, `AI_ASSESSMENT_JSON_SCHEMA`, `parseAssessment()`
- `tests/privacy.test.ts` (contract parsing cases)

## Env vars
`GEMINI_API_KEY`; `GEMINI_MODEL_FAST`, `GEMINI_MODEL_REASONING`, `GEMINI_MODEL_VISION` (all `gemini-3.5-flash-lite`, free tier ~500 req/day; `gemini-3.5-flash` allows only 20/day). `GROQ_API_KEY`, `GROQ_VISION_MODEL` (`qwen/qwen3.8-27b`, from console.groq.com/docs/vision, a preview model: 30 RPM / 1K RPD free; each image ≈ 2048 tokens). `AI_DEMO_CACHE` (on | off | empty = on in dev, off in prod). Never hard-code model names.

## Output contract (architecture.md §5)
```json
{"photo_matches_disaster":0.0,"photo_ai_generated_risk":0.0,"message_consistency":0.0,
 "language_detected":"en","red_flags":["…"],"explanation":"One short paragraph."}
```
Numbers are in 0..1. Anything that fails zod is invalid.

## Call pattern (`@google/genai`)
```ts
ai.models.generateContent({
  model: process.env.GEMINI_MODEL_VISION,
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType, data: base64Photo } },
    { text: buildAssessPrompt(e) } ] }],
  config: { systemInstruction: ASSESS_SYSTEM_PROMPT, responseMimeType: "application/json",
            responseJsonSchema: AI_ASSESSMENT_JSON_SCHEMA, temperature: 0 },
});
```
Read `res.text`, then `parseAssessment`.

## Retry and fallback policy
Order: demo cache (fixture claims only) → Gemini → Groq. Groq gets the same prompt and photo as one user message (text part + `image_url` base64 data URL, `response_format: json_object`, no system message: the docs show none with images). Its output goes through the same `parseAssessment` (a `<think>` block is stripped).
Errors are classified by `classifyAiError` in `lib/ai/contract.ts` (pure, tested in `tests/ai-errors.test.ts`):
- **Bad output** (fails the zod contract) or other errors: first try + one retry, then `IN_REVIEW` (architecture §5).
- **unavailable** (500/503 `UNAVAILABLE`, timeouts, aborts): up to 3 extra retries, backoff 3 s → 6 s → 12 s, then hand over to the next provider.
- **rate_limited** (429 per-minute, `retryDelay` ≤ 60 s): wait the `retryDelay`, then retry.
- **quota_exhausted** (429 `...PerDay...`, or `retryDelay` > 60 s): no retry; hand over to Groq at once.
- Only when **both** providers fail → `{ ok: false, error: "both AI providers failed. gemini (…): … || groq (…): …" }` → `decide(..., { aiValid: false, aiFailure })` → **IN_REVIEW** with that reason. Never auto-reject on AI failure.
- The answering provider/model is stored on `Claim.ai_provider` / `ai_model` / `ai_cached` and shown on `/admin`; call counts are in `signals.detail.ai.calls`.

## Demo cache
Only claims whose photo bytes **and** message match a fixture in `simulators/fixtures/claims.json` (checked on the server from hashes) read/write `ai_cache`. Key = sha256(photo sha | message sha | model | `PROMPT_VERSION`), so editing the prompt invalidates it. Real claims always call the AI. `sim:reset` keeps the cache; clear it with `db.aiCache.deleteMany()` to force fresh calls.

## Prompt rules
- The system prompt says the model scores evidence and never approves anyone or decides money.
- Each field is scored on its own evidence: a photo/message mismatch lowers the photo score and adds a red flag but does not also lower `message_consistency` (no double counting).
- The claimant message goes inside `"""…"""` and is capped at 2000 chars, so it is treated as data and not as instructions.
- Disaster context is sent as name, type, region and start date.

## PII: send only what the check needs
Sent: the photo bytes, the message text and the disaster context. **Never sent:** PayPal email, name, exact GPS, claim ids. Location is a separate code signal and is deliberately not given to the model.

## Free-tier limits
Measured 2026-11-07: `gemini-3.5-flash` free tier = **20 requests/day per project** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`); that is why we use Flash-Lite (~500/day). Each `sim:demo` run needs at most 5 AI calls (duplicates skip the call), and 0 when the demo cache is warm. `check:env` makes exactly one Gemini call and one Groq call. The 429 body names the exact quota and `retryDelay`.

## Gotchas
- `-latest` aliases can move or be overloaded. Pin versions for the demo and re-check with `npm run check:env`.
- `@google/genai` sets no request timeout by default (one call hung ~3.7 min); keep `httpOptions.timeout`.
- A genuine fixture must really fit its claim: a Florida photo (palms, Spanish moss) for a Missouri flood was rightly scored low and was replaced. Don't prompt the model to ignore scene mismatches.
- `sanitizeError` strips both API keys from error text. Never log request bodies (they contain the photo and message).

## Test
- Unit: `tests/privacy.test.ts` → valid, fenced, out-of-range, missing-field and non-JSON cases.
- Unit: `tests/ai-fallback.test.ts` → one call when healthy, daily-429 → Groq, 503 backoff → Groq, both fail → reason names both, Groq output held to the contract, cache hit = 0 calls, real claims never cached.
- Live: `npm run check:env` (1 Gemini + 1 Groq call) and `npm run sim:claims` (prints provider, calls and raw sub-scores per fixture).
