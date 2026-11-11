import type { Prisma } from "@/lib/generated/prisma/client";
import type { PhotoMatch } from "./photos";

/**
 * CLIP near-duplicate store in Postgres, used when Elasticsearch is NOT configured (free hosting has no free
 * Elasticsearch). Same data and same rule as the Elastic photos index: one row per (claim, crop variant), and
 * the new photo's FULL embedding is compared with every stored crop. The comparison is exact (brute force in
 * code), which is fine for a demo-size pool; Elasticsearch kNN stays the path for scale.
 * No PII: claim_public_id + vectors. Rows go with their claim (ON DELETE CASCADE).
 */

/** Newest photos compared per claim (× 7 crops × 2 KB ≈ 14 MB read at the cap). */
export const PG_MAX_PHOTOS = 1000;
const CROPS_PER_PHOTO = 7;

/** 512 float32, little-endian (2 KB per crop). */
export function encodeVec(vec: number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new Float32Array(vec).buffer);
}

export function decodeVec(bytes: Uint8Array): Float32Array {
  // Copy first: a driver buffer can start at an offset that is not a multiple of 4.
  return new Float32Array(new Uint8Array(bytes).buffer);
}

export type StoredCrop = { claimPublicId: string; variant: string; vec: Float32Array };

/** Pure (tested): best cosine per other claim (max over its stored crops), strongest first. Vectors are unit length. */
export function bestMatches(query: number[], rows: StoredCrop[], excludeClaimPublicId: string, top = 14): PhotoMatch[] {
  const q = new Float32Array(query);
  const best = new Map<string, PhotoMatch>();
  for (const r of rows) {
    if (r.claimPublicId === excludeClaimPublicId || r.vec.length !== q.length) continue;
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i]! * r.vec[i]!;
    const cos = Math.round(dot * 10000) / 10000;
    const cur = best.get(r.claimPublicId);
    if (!cur || cur.cosine < cos) best.set(r.claimPublicId, { claimPublicId: r.claimPublicId, cosine: cos, variant: r.variant });
  }
  return [...best.values()].sort((a, b) => b.cosine - a.cosine).slice(0, top);
}

/** Runs on the caller's transaction, so it sits inside the photo advisory lock like the dHash comparison. */
export async function nearestPhotosPg(tx: Prisma.TransactionClient, vec: number[], excludeClaimPublicId: string): Promise<PhotoMatch[]> {
  const rows = await tx.photoEmbedding.findMany({
    where: { claimPublicId: { not: excludeClaimPublicId } },
    orderBy: { createdAt: "desc" },
    take: PG_MAX_PHOTOS * CROPS_PER_PHOTO,
    select: { claimPublicId: true, variant: true, vec: true },
  });
  return bestMatches(
    vec,
    rows.map((r) => ({ claimPublicId: r.claimPublicId, variant: r.variant, vec: decodeVec(r.vec) })),
    excludeClaimPublicId,
  );
}

/** Store every crop. Idempotent per (claim, variant): a recovery re-run replaces its own rows. */
export async function storePhotoVariantsPg(tx: Prisma.TransactionClient, claimPublicId: string, variants: Array<{ variant: string; vec: number[] }>): Promise<void> {
  await tx.photoEmbedding.deleteMany({ where: { claimPublicId } });
  await tx.photoEmbedding.createMany({ data: variants.map((v) => ({ claimPublicId, variant: v.variant, vec: encodeVec(v.vec) })) });
}
