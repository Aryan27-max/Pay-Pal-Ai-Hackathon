---
name: claim-verification
description: Use when changing how claims are scored or decided — the five signals, weights, hard rules, thresholds, packet caps and FIFO allocation in lib/scoring.
---

# claim-verification

## Purpose
`lib/scoring` is the only code that decides **approve / review / reject** and **how much**. It is pure TypeScript with no I/O and no env access. Gemini supplies inputs only (hard rule 1). Design: `architecture.md` §5.

## Files it owns
- `lib/scoring/index.ts`: config, signal builders, `totalScore`, `decide`, `packetFor`, `planFifoAllocation`
- `workflows/verify-claim.ts`: gathers the signals (DB, location, AI) and persists the decision
- `lib/disasters/index.ts` + `simulators/fixtures/flood-zone.json`: Phase 1 location check
- `tests/scoring.test.ts`

## Env vars
`WEIGHT_PHOTO=30`, `WEIGHT_LOCATION=25`, `WEIGHT_MESSAGE=20`, `WEIGHT_UNIQUENESS=15`, `WEIGHT_VOUCHING=10` (sum must be 100), `AUTO_PAYOUT_THRESHOLD=75`, `HUMAN_REVIEW_THRESHOLD=50`, `DEFAULT_PACKET_USD=50`, `MAX_FIRST_PACKET_USD=100`. `scoringConfigFrom(env())` validates them.

## Signals (each 0..1)
| Signal | Phase 1 rule |
| --- | --- |
| photo | `photo_matches_disaster × (1 − photo_ai_generated_risk)` |
| location | distance to demo zone centre ≤ radius → 1; ≤ radius + buffer → 0.5; else 0 |
| message | `message_consistency` |
| uniqueness | 0 if another claim has the same PayPal email **or** photo SHA-256 (device id later), else 1 |
| vouching | verified claims within 10 km: 0 → 0, 1 → 0.5, ≥ 2 → 1 |

Location is **not** sent to Gemini, so it isn't counted twice.

## Decision order (`decide`)
1. `uniqueness === 0` → **REJECTED** (hard rule, any score)
2. AI output invalid after one retry → **IN_REVIEW**
3. `score ≥ 75` → **APPROVED**; `50 ≤ score < 75` → **IN_REVIEW**; `< 50` → **REJECTED** (appealable)

Score = `round(Σ weight × signal)`. Integers make the thresholds exact.

## Packet (`packetFor`)
`min(DEFAULT, MAX)` in integer cents. If the pool is below that → `WAITING_FUNDS`. Never a partial packet, never above the pool.

## FIFO allocation (`planFifoAllocation`)
Oldest donation with `remaining > 0` first. The allocations always sum to the payout; throws if the pool is short.

## How to change a rule
1. Update `architecture.md` §5 first.
2. Change the pure function, then add a test at the boundary (exactly 50, exactly 75, one cent short, …).
3. Run `npm test`, then `npm run sim:claims` to see the fixture outcomes still match `expect`.

## Gotchas
- Do all money math in cents (`toCents`/`fromCents`), never floats in USD.
- WAITING_FUNDS, PAYOUT_PENDING, PAID and ON_CHAIN count as "verified" for vouching (`VERIFIED_CLAIM_STATUSES`).
- Duplicates skip the Gemini call (saves quota). The explanation says why.
- Repeat claims from the same account get `claim_public_id = HMAC(email#n)` so they can be stored and rejected.

## Test
`npm test`. It covers config validation, every signal builder, exact 50 / 74 / 75 / 49, duplicate with score 85, invalid AI, packet edge cases and FIFO.
