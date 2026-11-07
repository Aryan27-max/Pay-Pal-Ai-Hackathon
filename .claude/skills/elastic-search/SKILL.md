---
name: elastic-search
description: Use for Elastic work — the photos index (CLIP dense_vector kNN for reused photos) and the claims index (geo_point + event + status for community vouching), mappings, queries and seeding.
---

# elastic-search

## Purpose

Two indices on Elastic Cloud **Serverless** (9.x), reached only through `lib/search`:

| Index | Holds | Used for |
| --- | --- | --- |
| `ELASTIC_PHOTOS_INDEX` | `claim_public_id`, `embedding` (512-d), `created_at` | near-duplicate photo kNN |
| `ELASTIC_CLAIMS_INDEX` | `claim_public_id`, `location` (~1 km rounded), `event_id`, `status`, `duplicate`, `updated_at` | vouching |

Never stored: photos, emails, names, messages, exact GPS.

## Files it owns

- `lib/search/client.ts` — singleton `Client`, `ensureIndices()`
- `lib/search/photos.ts` — `findNearDuplicate(vec, exclude)`, `indexPhoto(id, vec)`
- `lib/search/claims.ts` — `upsertClaimDoc(...)`, `countVouchers(...)`
- `scripts/elastic-setup.ts` — `npm run elastic:setup` (create indices, idempotent)

## Env vars

`ELASTIC_URL`, `ELASTIC_API_KEY` (encoded API key), `ELASTIC_PHOTOS_INDEX`, `ELASTIC_CLAIMS_INDEX`.

## How to

Client (`@elastic/elasticsearch` 9): `new Client({ node: ELASTIC_URL, auth: { apiKey: ELASTIC_API_KEY } })`.

Photos mapping:
```json
{ "properties": {
  "claim_public_id": { "type": "keyword" },
  "embedding": { "type": "dense_vector", "dims": 512, "index": true, "similarity": "cosine" },
  "created_at": { "type": "date" } } }
```
Near-duplicate query (top hit only, the claim itself excluded):
```ts
client.search({ index, size: 1, _source: ["claim_public_id"],
  knn: { field: "embedding", query_vector: vec, k: 1, num_candidates: 50,
         filter: { bool: { must_not: { term: { claim_public_id: self } } } } } });
```
`_score` = `(1 + cosine) / 2`. Compare `2·_score − 1` with `CLIP_DUPLICATE_THRESHOLD` in code.
Index the photo after the search with `refresh: true` so the next claim sees it.

Claims mapping: `claim_public_id` keyword, `location` geo_point, `event_id` keyword, `status` keyword,
`duplicate` boolean, `updated_at` date. Vouching count:
```ts
client.count({ index, query: { bool: { filter: [
  { term: { event_id } }, { terms: { status: VERIFIED_STATUSES } }, { term: { duplicate: false } },
  { geo_distance: { distance: "10km", location: { lat, lon } } } ],
  must_not: [{ term: { claim_public_id: self } }] } } });
```
`vouchingSignal(count)` in lib/scoring caps it (1 → 0.5, ≥ 2 → 1). The claim doc is upserted on every
status change (verify, reviewer decision, payout), so rejected and duplicate claims never vouch.

## Gotchas

- Serverless rejects index settings such as `number_of_shards`; send mappings only.
- `refresh: true` on single-doc writes is fine at demo volume; don't use it in bulk loads.
- Location in Elastic is rounded to 0.01° (~1 km): private infrastructure, coarse enough not to pinpoint a
  home; the public dashboard still uses the ~10 km `geo_cell`.
- `sim:reset` deletes both indices' documents (`deleteByQuery` match_all), not the indices.
- Elastic down → photo near-duplicate check is "unknown": the claim goes to IN_REVIEW (never auto-pay
  on an unchecked photo). TODO: confirm Serverless `refresh` latency under load.

## Test

- `npm run elastic:setup` then `npm run check:env` (Elastic ping).
- `tests/search.test.ts` checks the query bodies (pure builders) and score ↔ cosine conversion.
- Postman: none (Elastic is internal; not exposed by our API).
