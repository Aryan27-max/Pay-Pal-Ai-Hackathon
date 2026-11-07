---
name: claim-verification
description: Use when changing how claims are scored or decided — the five signals, weights, hard rules, thresholds, packet caps and FIFO allocation in lib/scoring.
---

# claim-verification

## Purpose
`lib/scoring` is the only code that decides **approve / review / reject** and **how much**. It is pure TypeScript with no I/O and no env access. Gemini supplies inputs only (hard rule 1). Design: `architecture.md` §5.

## Files it owns
- `lib/scoring/index.ts`: config, signal builders, `totalScore`, `decide`, `packetFor`, `planFifoAllocation`
- `workflows/checks.ts`: the five independent checks (location, photo, message, uniqueness, vouching)
- `workflows/verify-claim.ts`: runs them in parallel, makes the ONE AI call, calls `decide`, persists
- `tests/scoring.test.ts`, `tests/phase2-scoring.test.ts`
- Data sources live in other skills: `disaster-feeds`, `photo-forensics`, `elastic-search`, `speech-whisper`

## Env vars
`WEIGHT_PHOTO=30`, `WEIGHT_LOCATION=25`, `WEIGHT_MESSAGE=20`, `WEIGHT_UNIQUENESS=15`, `WEIGHT_VOUCHING=10` (sum must be 100), `AUTO_PAYOUT_THRESHOLD=75`, `HUMAN_REVIEW_THRESHOLD=50`, `DEFAULT_PACKET_USD=50`, `MAX_FIRST_PACKET_USD=100`. `scoringConfigFrom(env())` validates them.

## Signals (each 0..1)
| Signal | Rule (Phase 2) |
| --- | --- |
| photo | `photo_matches_disaster × (1 − photo_ai_generated_risk) × exifFactor` (EXIF plausible 1, missing 0.9, contradicting 0.6) |
| location | `areaLocationSignal(distance outside the best event area, buffer)`: inside 1, buffer 0.5, else 0 (GDACS/USGS/SIMULATED; Kernel can raise to 1) |
| message | `message_consistency` (typed text + voice transcript, one AI call) |
| uniqueness | 0 if another claim has the same PayPal email, photo SHA-256 **or a CLIP near-duplicate** (cosine ≥ 0.92), else 1 |
| vouching | approved, non-duplicate claims of the same event within 10 km (Elastic): 0 → 0, 1 → 0.5, ≥ 2 → 1 |

Location is **not** sent to Gemini, so it isn't counted twice.

## Decision order (`decide`)
1. `uniqueness === 0` → **REJECTED** (hard rule, any score); the reason names account / hash / CLIP (`duplicateReason`)
2. farther than `FAR_FROM_EVENT_KM` (100) from every active event (feeds read) → **REJECTED** (appealable)
3. no valid AI assessment (Gemini and Groq both failed) → **IN_REVIEW**
4. `score ≥ 75` → **APPROVED**, unless photo or message < `CORE_EVIDENCE_FLOOR` (0.30) or the photo check was unavailable → **IN_REVIEW**
5. `50 ≤ score < 75` → **IN_REVIEW**; `< 50` → **REJECTED** (appealable). Weak-evidence notes are appended to the reason.

Principle: code-proven fraud (1–2) is rejected; model-judged problems (4) go to a human, never auto-rejected or auto-paid.

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
- Duplicates and far-from-event claims skip the AI call (saves quota). The explanation says why.
- `caughtBy()` in `simulators/claims.ts` derives which check stopped a claim from `signals.detail`, in the same order.
- Repeat claims from the same account get `claim_public_id = HMAC(email#n)` so they can be stored and rejected.

## Test
`npm test`. It covers config validation, every signal builder, exact 50 / 74 / 75 / 49, duplicate with score 85, invalid AI, packet edge cases, FIFO, EXIF factors, CLIP near-duplicate with a perfect score, far-from-event, the core-evidence floor and the photo-check-down rule. `npm run sim:demo` checks every fake is caught by the right check.
