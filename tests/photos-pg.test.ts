import { describe, expect, it } from "vitest";
import { bestMatches, decodeVec, encodeVec, type StoredCrop } from "@/lib/search/photos-pg";
import { normalise } from "@/lib/vision/clip";
import { nearDuplicateRule } from "@/lib/scoring";

/** Postgres CLIP store (used when Elasticsearch is off, e.g. the free hosted deploy). */
const unit = (seed: number) => normalise(Array.from({ length: 512 }, (_, i) => Math.sin(seed * 31.7 + i * 0.37) + (i % 7 === seed % 7 ? 0.5 : 0)));
const crop = (claimPublicId: string, variant: string, vec: number[]): StoredCrop => ({ claimPublicId, variant, vec: new Float32Array(vec) });

describe("photo embeddings in Postgres", () => {
  it("encode → decode round-trips 512 float32 values (2 KB)", () => {
    const v = unit(1);
    const bytes = encodeVec(v);
    expect(bytes.byteLength).toBe(2048);
    const back = decodeVec(bytes);
    expect(back.length).toBe(512);
    for (let i = 0; i < 512; i++) expect(back[i]).toBeCloseTo(v[i]!, 6);
  });

  it("decodes a buffer that does not start on a 4-byte boundary (driver slices)", () => {
    const v = unit(2);
    const padded = new Uint8Array(2049);
    padded.set(encodeVec(v), 1);
    expect(decodeVec(padded.subarray(1))[10]).toBeCloseTo(v[10]!, 6);
  });

  it("returns the best crop per claim, strongest first, and excludes the claim itself", () => {
    const q = unit(3);
    const rows = [crop("c_self", "full", q), crop("c_a", "full", unit(4)), crop("c_a", "c80", q), crop("c_b", "full", unit(5))];
    const m = bestMatches(q, rows, "c_self");
    expect(m.map((x) => x.claimPublicId)).toEqual(["c_a", "c_b"]);
    expect(m[0]).toMatchObject({ claimPublicId: "c_a", variant: "c80", cosine: 1 });
    // Same rule as Elasticsearch: an identical crop is a near-duplicate.
    expect(nearDuplicateRule({ clip: m[0]!.cosine, dhash: 30 })).toBe("clip");
  });

  it("matches Elasticsearch's cosine (no rounding drift beyond 4 decimals)", () => {
    const a = unit(6);
    const b = unit(7);
    const dot = a.reduce((s, x, i) => s + x * b[i]!, 0);
    expect(bestMatches(a, [crop("c_x", "full", b)], "c_self")[0]!.cosine).toBeCloseTo(dot, 4);
  });

  it("ignores vectors of the wrong size", () => {
    expect(bestMatches(unit(8), [crop("c_bad", "full", [1, 0, 0])], "c_self")).toEqual([]);
  });
});
