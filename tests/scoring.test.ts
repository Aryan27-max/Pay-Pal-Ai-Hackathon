import { describe, expect, it } from "vitest";
import {
  decide,
  locationSignal,
  messageSignal,
  packetFor,
  photoSignal,
  planFifoAllocation,
  planWaitingFundsRelease,
  scoringConfigFrom,
  totalScore,
  uniquenessSignal,
  vouchingSignal,
  type Signals,
} from "@/lib/scoring";

const cfg = scoringConfigFrom({
  WEIGHT_PHOTO: 30,
  WEIGHT_LOCATION: 25,
  WEIGHT_MESSAGE: 20,
  WEIGHT_UNIQUENESS: 15,
  WEIGHT_VOUCHING: 10,
  AUTO_PAYOUT_THRESHOLD: 75,
  HUMAN_REVIEW_THRESHOLD: 50,
  DEFAULT_PACKET_USD: 50,
  MAX_FIRST_PACKET_USD: 100,
});

const S = (p: Partial<Signals>): Signals => ({ photo: 0, location: 0, message: 0, uniqueness: 1, vouching: 0, ...p });

describe("config", () => {
  it("rejects weights that do not sum to 100", () => {
    expect(() =>
      scoringConfigFrom({
        WEIGHT_PHOTO: 30, WEIGHT_LOCATION: 25, WEIGHT_MESSAGE: 20, WEIGHT_UNIQUENESS: 15, WEIGHT_VOUCHING: 11,
        AUTO_PAYOUT_THRESHOLD: 75, HUMAN_REVIEW_THRESHOLD: 50, DEFAULT_PACKET_USD: 50, MAX_FIRST_PACKET_USD: 100,
      }),
    ).toThrow(/sum to 100/);
  });
  it("rejects review threshold >= auto threshold", () => {
    expect(() =>
      scoringConfigFrom({
        WEIGHT_PHOTO: 30, WEIGHT_LOCATION: 25, WEIGHT_MESSAGE: 20, WEIGHT_UNIQUENESS: 15, WEIGHT_VOUCHING: 10,
        AUTO_PAYOUT_THRESHOLD: 50, HUMAN_REVIEW_THRESHOLD: 50, DEFAULT_PACKET_USD: 50, MAX_FIRST_PACKET_USD: 100,
      }),
    ).toThrow();
  });
  it("rejects default packet above max", () => {
    expect(() =>
      scoringConfigFrom({
        WEIGHT_PHOTO: 30, WEIGHT_LOCATION: 25, WEIGHT_MESSAGE: 20, WEIGHT_UNIQUENESS: 15, WEIGHT_VOUCHING: 10,
        AUTO_PAYOUT_THRESHOLD: 75, HUMAN_REVIEW_THRESHOLD: 50, DEFAULT_PACKET_USD: 150, MAX_FIRST_PACKET_USD: 100,
      }),
    ).toThrow();
  });
});

describe("signals", () => {
  it("photo = match × (1 − AI risk), clamped", () => {
    expect(photoSignal({ photo_matches_disaster: 0.9, photo_ai_generated_risk: 0 })).toBeCloseTo(0.9);
    expect(photoSignal({ photo_matches_disaster: 1, photo_ai_generated_risk: 0.5 })).toBeCloseTo(0.5);
    expect(photoSignal({ photo_matches_disaster: 1, photo_ai_generated_risk: 1 })).toBe(0);
    expect(photoSignal({ photo_matches_disaster: 7, photo_ai_generated_risk: -3 })).toBe(1);
    expect(photoSignal({ photo_matches_disaster: Number.NaN, photo_ai_generated_risk: 0 })).toBe(0);
  });
  it("message passes through clamped", () => {
    expect(messageSignal({ message_consistency: 0.42 })).toBeCloseTo(0.42);
    expect(messageSignal({ message_consistency: 2 })).toBe(1);
  });
  it("location: inside = 1, buffer = 0.5, outside = 0, boundaries inclusive", () => {
    expect(locationSignal(0, 25, 10)).toBe(1);
    expect(locationSignal(25, 25, 10)).toBe(1);
    expect(locationSignal(25.01, 25, 10)).toBe(0.5);
    expect(locationSignal(35, 25, 10)).toBe(0.5);
    expect(locationSignal(35.01, 25, 10)).toBe(0);
    expect(locationSignal(-1, 25, 10)).toBe(0);
    expect(locationSignal(Number.NaN, 25, 10)).toBe(0);
  });
  it("uniqueness is binary", () => {
    expect(uniquenessSignal({ sameEmail: false, samePhoto: false })).toBe(1);
    expect(uniquenessSignal({ sameEmail: true, samePhoto: false })).toBe(0);
    expect(uniquenessSignal({ sameEmail: false, samePhoto: true })).toBe(0);
    expect(uniquenessSignal({ sameEmail: false, samePhoto: false, sameDevice: true })).toBe(0);
  });
  it("vouching: 0 → 0, 1 → 0.5, ≥2 → 1", () => {
    expect(vouchingSignal(0)).toBe(0);
    expect(vouchingSignal(1)).toBe(0.5);
    expect(vouchingSignal(2)).toBe(1);
    expect(vouchingSignal(50)).toBe(1);
    expect(vouchingSignal(-2)).toBe(0);
  });
});

describe("totalScore", () => {
  it("all signals 1 = 100, all 0 = 0", () => {
    expect(totalScore({ photo: 1, location: 1, message: 1, uniqueness: 1, vouching: 1 }, cfg.weights)).toBe(100);
    expect(totalScore({ photo: 0, location: 0, message: 0, uniqueness: 0, vouching: 0 }, cfg.weights)).toBe(0);
  });
  it("weights are applied per signal", () => {
    expect(totalScore(S({ photo: 1, uniqueness: 0 }), cfg.weights)).toBe(30);
    expect(totalScore(S({ location: 1, uniqueness: 0 }), cfg.weights)).toBe(25);
  });
});

describe("decide — thresholds and hard rules", () => {
  // location 1 (25) + uniqueness 1 (15) = 40, then add message to hit exact totals.
  it("exactly 75 → APPROVED", () => {
    const s = S({ location: 1, message: 1, photo: 0.5 }); // 25 + 20 + 15 + 15 = 75
    expect(totalScore(s, cfg.weights)).toBe(75);
    expect(decide(s, cfg).outcome).toBe("APPROVED");
  });
  it("74 → IN_REVIEW", () => {
    const s = S({ location: 1, message: 0.95, photo: 0.5 }); // 25 + 19 + 15 + 15 = 74
    expect(totalScore(s, cfg.weights)).toBe(74);
    expect(decide(s, cfg).outcome).toBe("IN_REVIEW");
  });
  it("exactly 50 → IN_REVIEW", () => {
    const s = S({ location: 1, vouching: 1 }); // 25 + 15 + 10 = 50
    expect(totalScore(s, cfg.weights)).toBe(50);
    expect(decide(s, cfg).outcome).toBe("IN_REVIEW");
  });
  it("49 → REJECTED (appealable)", () => {
    const s = S({ location: 1, vouching: 0.9 }); // 25 + 15 + 9 = 49
    expect(totalScore(s, cfg.weights)).toBe(49);
    const d = decide(s, cfg);
    expect(d.outcome).toBe("REJECTED");
    expect(d.reason).toMatch(/appealable/);
  });
  it("duplicate with a high score → REJECTED (hard rule beats score)", () => {
    const s: Signals = { photo: 1, location: 1, message: 1, uniqueness: 0, vouching: 1 }; // 85
    expect(totalScore(s, cfg.weights)).toBe(85);
    const d = decide(s, cfg);
    expect(d.outcome).toBe("REJECTED");
    expect(d.reason).toMatch(/duplicate/);
  });
  it("invalid AI output → IN_REVIEW even if the score is high", () => {
    const s: Signals = { photo: 1, location: 1, message: 1, uniqueness: 1, vouching: 1 };
    expect(decide(s, cfg, { aiValid: false }).outcome).toBe("IN_REVIEW");
  });
  it("when both AI providers fail, the review reason says so and carries the cause", () => {
    const s: Signals = { photo: 0, location: 1, message: 0, uniqueness: 1, vouching: 0 };
    const d = decide(s, cfg, { aiValid: false, aiFailure: "both AI providers failed. gemini (m): quota_exhausted | HTTP 429" });
    expect(d.outcome).toBe("IN_REVIEW");
    expect(d.reason).toMatch(/Gemini and Groq fallback both failed/);
    expect(d.reason).toContain("quota_exhausted | HTTP 429");
  });
  it("duplicate beats invalid AI → REJECTED", () => {
    const s = S({ uniqueness: 0, location: 1 });
    expect(decide(s, cfg, { aiValid: false }).outcome).toBe("REJECTED");
  });
  it("a typical genuine first claim (no vouches yet) auto-approves", () => {
    const s: Signals = { photo: 0.9, location: 1, message: 0.9, uniqueness: 1, vouching: 0 }; // 27+25+18+15 = 85
    expect(decide(s, cfg).outcome).toBe("APPROVED");
  });
  it("genuine photo + message but outside the zone lands in review", () => {
    const s: Signals = { photo: 0.9, location: 0, message: 0.9, uniqueness: 1, vouching: 0 }; // 60
    expect(decide(s, cfg).outcome).toBe("IN_REVIEW");
  });
});

describe("packetFor", () => {
  it("pays the default packet when the pool covers it", () => {
    expect(packetFor(cfg, 10_000)).toEqual({ kind: "PAY", amountCents: 5_000 });
  });
  it("pays when the pool is exactly the packet", () => {
    expect(packetFor(cfg, 5_000)).toEqual({ kind: "PAY", amountCents: 5_000 });
  });
  it("waits for funds when the pool is one cent short (no partial packets)", () => {
    expect(packetFor(cfg, 4_999)).toEqual({ kind: "WAITING_FUNDS", neededCents: 5_000, poolCents: 4_999 });
  });
  it("never exceeds MAX_FIRST_PACKET_USD", () => {
    const capped = { ...cfg, defaultPacketUsd: 500, maxFirstPacketUsd: 100 };
    expect(packetFor(capped, 1_000_000)).toEqual({ kind: "PAY", amountCents: 10_000 });
  });
  it("treats a negative pool as empty", () => {
    expect(packetFor(cfg, -100).kind).toBe("WAITING_FUNDS");
  });
});

describe("planFifoAllocation", () => {
  const d = (id: string, cents: number, t: number) => ({ id, remainingCents: cents, createdAt: new Date(t) });
  it("takes from the oldest donations first", () => {
    const plan = planFifoAllocation([d("new", 10_000, 3), d("old", 1_000, 1), d("mid", 2_500, 2)], 5_000);
    expect(plan).toEqual([
      { donationId: "old", amountCents: 1_000 },
      { donationId: "mid", amountCents: 2_500 },
      { donationId: "new", amountCents: 1_500 },
    ]);
  });
  it("skips donations with nothing left", () => {
    expect(planFifoAllocation([d("a", 0, 1), d("b", 5_000, 2)], 5_000)).toEqual([{ donationId: "b", amountCents: 5_000 }]);
  });
  it("allocations always sum to the payout", () => {
    const plan = planFifoAllocation([d("a", 333, 1), d("b", 333, 2), d("c", 10_000, 3)], 5_000);
    expect(plan.reduce((s, p) => s + p.amountCents, 0)).toBe(5_000);
  });
  it("throws when the pool cannot cover the payout", () => {
    expect(() => planFifoAllocation([d("a", 1_000, 1)], 5_000)).toThrow(/insufficient/);
  });
  it("rejects non-integer or non-positive payouts", () => {
    expect(() => planFifoAllocation([d("a", 1_000, 1)], 0)).toThrow();
    expect(() => planFifoAllocation([d("a", 1_000, 1)], 10.5)).toThrow();
  });
});

describe("planWaitingFundsRelease — WAITING_FUNDS claims pay oldest first", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 7, 10, min));
  const waiting = [
    { id: "c-newest", createdAt: t(30) },
    { id: "c-oldest", createdAt: t(10) },
    { id: "c-middle", createdAt: t(20) },
  ];

  it("releases nothing while the pool is below one packet", () => {
    expect(planWaitingFundsRelease(cfg, 4999, waiting)).toEqual([]);
  });
  it("a pool of exactly one packet releases only the oldest claim", () => {
    expect(planWaitingFundsRelease(cfg, 5000, waiting)).toEqual(["c-oldest"]);
  });
  it("releases as many full packets as the pool covers, in age order", () => {
    expect(planWaitingFundsRelease(cfg, 10_999, waiting)).toEqual(["c-oldest", "c-middle"]);
    expect(planWaitingFundsRelease(cfg, 15_000, waiting)).toEqual(["c-oldest", "c-middle", "c-newest"]);
    expect(planWaitingFundsRelease(cfg, 1_000_000, waiting)).toEqual(["c-oldest", "c-middle", "c-newest"]);
  });
  it("never pays a partial packet and never skips ahead of an older claim", () => {
    const plan = planWaitingFundsRelease(cfg, 7_500, waiting);
    expect(plan).toEqual(["c-oldest"]);
  });
  it("breaks createdAt ties deterministically by id and handles an empty queue / negative pool", () => {
    const tied = [{ id: "b", createdAt: t(1) }, { id: "a", createdAt: t(1) }];
    expect(planWaitingFundsRelease(cfg, 5000, tied)).toEqual(["a"]);
    expect(planWaitingFundsRelease(cfg, 100_000, [])).toEqual([]);
    expect(planWaitingFundsRelease(cfg, -500, waiting)).toEqual([]);
  });
  it("respects MAX_FIRST_PACKET_USD when the default is larger than the cap", () => {
    const capped = { ...cfg, defaultPacketUsd: 200, maxFirstPacketUsd: 60 };
    expect(planWaitingFundsRelease(capped, 12_000, waiting)).toEqual(["c-oldest", "c-middle"]);
  });
});
