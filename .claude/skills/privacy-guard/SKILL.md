---
name: privacy-guard
description: Use for anything that becomes public (dashboard, receipt, API responses, Solana trail) — HMAC ids, ~10 km geo rounding, redaction and the privacy review checklist.
---

# privacy-guard

## Purpose
Hard rule 4: no names, emails, photos, phone numbers or exact GPS on-chain or on any public surface. `lib/privacy` is the gate.

## Files it owns
- `lib/privacy/index.ts`: `claimPublicId`, `donorPublicId`, `reviewerPublicId`, `geoCell`, `roundGeo`, `redactClaim`, `maskEmail`, `sha256Hex`, `haversineKm`, `safeEqual`
- `tests/privacy.test.ts`

## Env vars
`CLAIM_ID_SALT` (≥ 32 chars, random; the helpers throw if it is shorter).

## IDs
| ID | Formula | Shape |
| --- | --- | --- |
| claim | `HMAC-SHA256(salt, "claim:" + lower(email))`; repeat claims from the same account use `"claim:" + email + "#n"` | `c_` + 20 hex |
| donor | `HMAC(salt, "donor:" + payer_id)` (sim donors: `sim:<name>`) | `d_` + 20 hex |
| reviewer | `HMAC(salt, "reviewer:" + token)` | `r_` + 12 hex |

The prefixes separate the domains, so a donor id and a claim id for the same person never match.

## Geo
`geoCell(lat, lon)` snaps to a 0.1° grid (≈ 11 km N–S) and returns the cell centre, e.g. `"38.75,-90.45"`. Exact `lat`/`lon` stay in private DB columns for distance checks only.

## What is private (never leaves the server publicly)
`Claim.paypalEmail`, `Claim.lat`, `Claim.lon`, `Claim.messageText`, photo bytes (not stored at all in Phase 1, only the SHA-256), payer emails (never stored).

## Public surfaces and what they may show
- `GET /api/claims/:publicId` → `redactClaim` + decisions + payout amount/status
- `GET /api/pool` → totals + donor public ids
- `/admin`, `/receipt/[id]` → public ids, geo cells, amounts, PayPal order/batch ids
- `/review` (token-protected) → may show the message text to reviewers, never the email
- Solana memo (Phase 2): `RS|v1|<type>|<public_id>|<amount>|<sha256>` only

## Review checklist (run before merging anything public)
- [ ] Does any response or page include `paypalEmail`, `lat`, `lon` or `messageText` outside `/review`?
- [ ] Are ids built only with `lib/privacy` helpers?
- [ ] Do logs print emails, tokens or secrets? (Simulators print `claimant#n`, never addresses.)
- [ ] Does anything sent to Gemini include an email, name or GPS? (It must not.)
- [ ] Is a new public field a hash, a public id, a geo cell or an amount? If not, stop.

## Gotchas
- Lower-case and trim emails before hashing, or the same person gets two ids.
- Use `safeEqual` (timing-safe) for token checks.
- Rotating `CLAIM_ID_SALT` changes every public id. Don't rotate it after the demo data is on-chain.

## Test
`npm test` → `tests/privacy.test.ts`: stability, case-insensitivity, salt separation, short-salt refusal, grid snapping, redaction drops private fields.
