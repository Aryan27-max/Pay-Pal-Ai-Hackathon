import { es, indices, scoreToCosine } from "./client";

/** Pure query builder (tested): nearest stored photo, excluding the claim itself. */
export function nearDuplicateQuery(vec: number[], excludeClaimPublicId: string) {
  return {
    size: 1,
    _source: ["claim_public_id"],
    knn: {
      field: "embedding",
      query_vector: vec,
      k: 1,
      num_candidates: 50,
      filter: { bool: { must_not: [{ term: { claim_public_id: excludeClaimPublicId } }] } },
    },
  };
}

export type NearestPhoto = { claimPublicId: string; cosine: number } | null;

export async function nearestPhoto(vec: number[], excludeClaimPublicId: string): Promise<NearestPhoto> {
  const r = await es().search<{ claim_public_id: string }>({ index: indices().photos, ...nearDuplicateQuery(vec, excludeClaimPublicId) });
  const hit = r.hits.hits[0];
  if (!hit?._source || typeof hit._score !== "number") return null;
  return { claimPublicId: hit._source.claim_public_id, cosine: Math.round(scoreToCosine(hit._score) * 10000) / 10000 };
}

/** Index after the search so the next claim sees it. Doc id = claim_public_id (idempotent). */
export async function indexPhoto(claimPublicId: string, vec: number[]): Promise<void> {
  await es().index({
    index: indices().photos,
    id: claimPublicId,
    document: { claim_public_id: claimPublicId, embedding: vec, created_at: new Date().toISOString() },
    refresh: true,
  });
}
