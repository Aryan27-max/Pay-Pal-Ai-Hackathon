import { es, indices } from "./client";

/** Statuses that count as "verified" for vouching (approved, waiting for funds, paid). */
export const VOUCH_STATUSES = ["APPROVED", "WAITING_FUNDS", "PAYOUT_PENDING", "PAID", "ON_CHAIN"] as const;

/** Elastic stores location rounded to 0.01 degrees (~1 km): private, but never a home-level point. */
export const roundForIndex = (x: number) => Math.round(x * 100) / 100;

export type ClaimDoc = { claimPublicId: string; lat: number; lon: number; eventId: string | null; status: string; duplicate: boolean };

/** Pure doc builder (tested): no email, message, photo or exact GPS. */
export function claimDocument(d: ClaimDoc) {
  return {
    claim_public_id: d.claimPublicId,
    location: { lat: roundForIndex(d.lat), lon: roundForIndex(d.lon) },
    event_id: d.eventId ?? "none",
    status: d.status,
    duplicate: d.duplicate,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertClaimDoc(d: ClaimDoc): Promise<void> {
  await es().index({ index: indices().claims, id: d.claimPublicId, document: claimDocument(d), refresh: true });
}

/** Status-only update (reviewer decision, payout settled). Ignored when the doc is missing. */
export async function updateClaimStatus(claimPublicId: string, status: string): Promise<void> {
  try {
    await es().update({ index: indices().claims, id: claimPublicId, doc: { status, updated_at: new Date().toISOString() }, refresh: true });
  } catch (e) {
    if ((e as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) throw e;
  }
}

/** Pure query builder (tested): approved, non-duplicate claims of the same event within radiusKm. */
export function vouchQuery(p: { claimPublicId: string; lat: number; lon: number; eventId: string; radiusKm: number }) {
  return {
    query: {
      bool: {
        filter: [
          { term: { event_id: p.eventId } },
          { terms: { status: [...VOUCH_STATUSES] } },
          { term: { duplicate: false } },
          { geo_distance: { distance: `${p.radiusKm}km`, location: { lat: roundForIndex(p.lat), lon: roundForIndex(p.lon) } } },
        ],
        must_not: [{ term: { claim_public_id: p.claimPublicId } }],
      },
    },
  };
}

export async function countVouchers(p: Parameters<typeof vouchQuery>[0]): Promise<number> {
  const r = await es().count({ index: indices().claims, ...vouchQuery(p) });
  return r.count;
}

/** sim:reset: empty both indices (documents only). */
export async function clearIndices(): Promise<void> {
  const { photos, claims } = indices();
  for (const index of [photos, claims]) {
    if (await es().indices.exists({ index })) await es().deleteByQuery({ index, query: { match_all: {} }, refresh: true });
  }
}
