import { describe, expect, it } from "vitest";
import { senderBatchId } from "@/lib/paypal/payouts";
import { issuesOf, PayPalError } from "@/lib/paypal/client";

describe("senderBatchId — idempotency key for payouts", () => {
  const pub = "c_16d92d66d66a2d14e9ab";
  const rowA = "3f2a9c1e-7b44-4d2a-9e0f-1a2b3c4d5e6f";
  const rowB = "8c01d2e3-0000-4abc-8def-000000000000";

  it("is deterministic for the same claim record and attempt (safe to re-send)", () => {
    expect(senderBatchId(pub, rowA, 1)).toBe("c_16d92d66d66a2d14e9ab-3f2a9c1e-1");
    expect(senderBatchId(pub, rowA, 1)).toBe(senderBatchId(pub, rowA, 1));
  });
  it("a retry gets a new id", () => {
    expect(senderBatchId(pub, rowA, 2)).not.toBe(senderBatchId(pub, rowA, 1));
  });
  it("a new claim record from the same claimant never reuses an old id (demo reset case)", () => {
    expect(senderBatchId(pub, rowB, 1)).not.toBe(senderBatchId(pub, rowA, 1));
  });
  it("rejects bad attempts and non-uuid row ids", () => {
    expect(() => senderBatchId(pub, rowA, 0)).toThrow();
    expect(() => senderBatchId(pub, rowA, 1.5)).toThrow();
    expect(() => senderBatchId(pub, "not-a-uuid", 1)).toThrow();
  });
});

describe("PayPalError details", () => {
  it("keeps field + issue and drops value/description (they can echo emails)", () => {
    const details = [{ field: "sender_batch_id", issue: "SENDER_BATCH_ID_ALREADY_USED", value: "x", description: "someone@example.com" }];
    expect(issuesOf(details)).toBe(" [sender_batch_id: SENDER_BATCH_ID_ALREADY_USED]");
    const e = new PayPalError(400, "USER_BUSINESS_ERROR", "User business error.", "abc123", details);
    expect(e.message).toBe("PayPal 400 USER_BUSINESS_ERROR: User business error. [sender_batch_id: SENDER_BATCH_ID_ALREADY_USED] (debug_id abc123)");
    expect(e.message).not.toContain("@");
  });
  it("is empty when there are no details", () => {
    expect(issuesOf(undefined)).toBe("");
    expect(issuesOf([{ description: "no issue code" }])).toBe("");
  });
});
