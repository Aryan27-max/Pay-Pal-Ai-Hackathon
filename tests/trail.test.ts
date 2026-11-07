import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { buildMemo, canonicalJson, explorerTxUrl, rowHash } from "@/lib/trail";

describe("public trail (pure parts)", () => {
  it("canonical JSON is key-order independent, so anyone can re-hash /api/trail rows", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe('{"a":{"c":null,"d":[1,2]},"b":1}');
    expect(rowHash({ x: 1, y: "z" })).toBe(rowHash({ y: "z", x: 1 }));
    expect(rowHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
  it("memo follows RS|v1|<type>|<public_id>|<amount_usd>|<sha256> and stays small", () => {
    const sha = rowHash({ v: 1 });
    const m = buildMemo("decision.approved", "c_16d92d66d66a2d14e9ab", "0.00", sha);
    expect(m).toBe(`RS|v1|decision.approved|c_16d92d66d66a2d14e9ab|0.00|${sha}`);
    expect(Buffer.byteLength(m)).toBeLessThan(200);
    expect(() => buildMemo("donation", "d_x|evil", "1.00", sha)).toThrow();
  });
  it("explorer links point at devnet", () => {
    expect(explorerTxUrl("5abc", "https://explorer.solana.com/")).toBe("https://explorer.solana.com/tx/5abc?cluster=devnet");
  });
});
