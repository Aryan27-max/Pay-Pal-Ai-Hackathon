import { es, indices, scoreToCosine } from "./client";

/**
 * Photos index: one document per (claim, crop variant). The new photo's FULL embedding is compared with every
 * stored crop, so a cropped re-upload still lands next to its original. No PII: claim_public_id + vectors.
 */

/** Pure query builder (tested): nearest stored crops, excluding the claim itself. */
export function nearDuplicateQuery(vec: number[], excludeClaimPublicId: string, k = 14) {
  return {
    size: k,
    _source: ["claim_public_id", "variant"],
    knn: {
      field: "embedding",
      query_vector: vec,
      k,
      num_candidates: Math.max(100, k * 10),
      filter: { bool: { must_not: [{ term: { claim_public_id: excludeClaimPublicId } }] } },
    },
  };
}

export type PhotoMatch = { claimPublicId: string; cosine: number; variant: string };

/** Best cosine per other claim (max over its stored crops), strongest first. */
export async function nearestPhotos(vec: number[], excludeClaimPublicId: string): Promise<PhotoMatch[]> {
  const r = await es().search<{ claim_public_id: string; variant?: string }>({ index: indices().photos, ...nearDuplicateQuery(vec, excludeClaimPublicId) });
  const best = new Map<string, PhotoMatch>();
  for (const h of r.hits.hits) {
    if (!h._source || typeof h._score !== "number") continue;
    const cos = Math.round(scoreToCosine(h._score) * 10000) / 10000;
    const id = h._source.claim_public_id;
    if (!best.has(id) || best.get(id)!.cosine < cos) best.set(id, { claimPublicId: id, cosine: cos, variant: h._source.variant ?? "full" });
  }
  return [...best.values()].sort((a, b) => b.cosine - a.cosine);
}

/** Index every crop. Doc id = <claim_public_id>#<variant> (idempotent). Refreshed so the next claim sees it. */
export async function indexPhotoVariants(claimPublicId: string, variants: Array<{ variant: string; vec: number[] }>): Promise<void> {
  const now = new Date().toISOString();
  await es().bulk({
    refresh: true,
    operations: variants.flatMap((v) => [
      { index: { _index: indices().photos, _id: `${claimPublicId}#${v.variant}` } },
      { claim_public_id: claimPublicId, variant: v.variant, embedding: v.vec, created_at: now },
    ]),
  });
}
