import { describe, expect, it } from "vitest";
import { classifyAiError, describeAiError, MAX_INLINE_RETRY_MS } from "@/lib/ai/contract";

// Shapes copied from real Gemini API error bodies seen on 2026-11-07 (key material never included).
const DAILY =
  '{"error":{"code":429,"message":"You exceeded your current quota...","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"12116s"}]}}';
const PER_MINUTE =
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},{"retryDelay":"7s"}]}}';
const OVERLOADED = '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';

describe("classifyAiError", () => {
  it("a per-day quota is exhausted and never retried inline", () => {
    expect(classifyAiError(DAILY)).toEqual({ kind: "quota_exhausted", retryAfterMs: 12_116_000 });
  });
  it("a per-minute limit is retried after its retryDelay", () => {
    expect(classifyAiError(PER_MINUTE)).toEqual({ kind: "rate_limited", retryAfterMs: 7_000 });
  });
  it("a 429 asking for more than a minute is treated as exhausted", () => {
    const long = PER_MINUTE.replace('"7s"', `"${MAX_INLINE_RETRY_MS / 1000 + 1}s"`);
    expect(classifyAiError(long).kind).toBe("quota_exhausted");
  });
  it("503 / UNAVAILABLE / timeouts are transient", () => {
    expect(classifyAiError(OVERLOADED).kind).toBe("unavailable");
    expect(classifyAiError("timed out after 45000 ms").kind).toBe("unavailable");
    expect(classifyAiError("TypeError: fetch failed").kind).toBe("unavailable");
  });
  it("anything else (bad request, auth) is not retried as transient", () => {
    expect(classifyAiError('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}').kind).toBe("other");
    expect(classifyAiError('{"error":{"code":403,"status":"PERMISSION_DENIED"}}').kind).toBe("other");
  });
});

describe("describeAiError", () => {
  it("names the exact quota and retry delay", () => {
    expect(describeAiError(DAILY)).toBe(
      "quota_exhausted | HTTP 429 | RESOURCE_EXHAUSTED | quota GenerateRequestsPerDayPerProjectPerModel-FreeTier (limit 20) | retryDelay 12116s",
    );
    expect(describeAiError(OVERLOADED)).toBe("unavailable | HTTP 503 | UNAVAILABLE");
  });
  it("falls back to a short message for non-API errors", () => {
    expect(describeAiError("timed out after 45000 ms")).toBe("unavailable: timed out after 45000 ms");
  });
});

describe("classifyAiError: client timeouts", () => {
  it("an aborted / timed-out request is transient (back off, then fall back)", () => {
    expect(classifyAiError("This operation was aborted").kind).toBe("unavailable");
    expect(classifyAiError("AbortError: The user aborted a request.").kind).toBe("unavailable");
    expect(classifyAiError("The operation timed out.").kind).toBe("unavailable");
  });
});
