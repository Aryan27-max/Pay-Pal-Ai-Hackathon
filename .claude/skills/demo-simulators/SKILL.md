---
name: demo-simulators
description: Use when building or running the demo — stream page, scripted sandbox donations, claim fixtures (genuine, borderline, planted fakes), reset and the one-command demo run.
---

# demo-simulators

## Purpose
Make the five demo moments in `harness.md` §9 repeatable on demand: donations fill the pool, a genuine claim is paid, a borderline one goes to review, and fakes are caught.

## Files it owns
- `app/stream/*`: fake live stream, chat, pool totals, PayPal donate button
- `app/api/sim/stream/route.ts`: scripted card donations (operator token)
- `simulators/lib.ts`, `stream.ts`, `claims.ts`, `reset.ts`, `demo.ts`
- `simulators/fixtures/claims.json`, `flood-zone.json`, `photos/` (public-domain FEMA images, see `CREDITS.md`)

## Env vars
`APP_BASE_URL` (or `SIM_BASE_URL`), `REVIEWER_ACCESS_TOKEN` (operator token for sim routes), `SIM_DONOR_EMAILS` (3 sandbox **personal** emails for the manual button test), `SIM_CLAIMANT_EMAILS` (6 sandbox **personal** emails). All sandbox accounts must be **US**: PayPal does not support domestic India-to-India payments, so IN accounts can't take card donations or receive payouts.

## Commands
```bash
npm run dev                         # app on :3000 (keep running)
npm run sim:stream                  # 6 scripted donations (Ron $10, Rahul $25, …) in one go
npm run sim:claims                  # 7 claims; add -- --placeholder to use example.com emails
npm run sim:reset -- --yes          # wipe demo rows (not PayPal balances)
npm run sim:demo -- --runs 3        # reset → wave 1 → claims → wave 2 → settle → checks, 3 times
```

## Claim fixtures (order matters)
| key | expect | why |
| --- | --- | --- |
| genuine-1/2/3 | APPROVED | flood photo + specific message + inside the zone; 2 and 3 get vouching from 1 |
| borderline-outside-zone | IN_REVIEW | strong flood photo but ~50 km outside the zone (location 0) → ~60 |
| borderline-no-damage | IN_REVIEW | inside the zone, but the photo shows a dry undamaged street → ~58 |
| fake-reused-photo | REJECTED | same bytes as `genuine-1.jpg`, new account → uniqueness 0 |
| fake-duplicate-account | REJECTED | same PayPal email as genuine-1 → uniqueness 0 |

Score bands were checked live on 2026-11-07: 86 / 88 / 92, 60 / 58, rejected / rejected.

## Demo run shape (`sim:demo`)
1. Wave 1: Ron $10, Rahul $25, Mira $50 = $85. That covers one $50 packet.
2. Claims: genuine-1 is paid; genuine-2 and genuine-3 are APPROVED but park in `WAITING_FUNDS` (no partial packets).
3. Wave 2: Kofi $40, Lena $75, Sam $100. `retryWaitingFunds` releases genuine-2 then genuine-3 (oldest first, `lib/scoring.planWaitingFundsRelease`).
4. Settle via `/api/payouts/sync` until no payout is in flight, then print order/capture/payout batch ids and FIFO allocations.

## How scripted donations work
The PayPal button needs a human in the popup. `sim:stream` instead creates single-step orders with a **sandbox test card** (`payment_source.card`, `PayPal-Request-Id` required). Card: `4012000033330026`, an official sandbox test Visa from https://developer.paypal.com/tools/sandbox/card-testing/ (any future expiry, any 3-digit CVV). This needs *Advanced Credit and Debit Card Payments* on a **US** sandbox app. Without it PayPal returns `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`.

## Gotchas
- Re-running `sim:claims` without a reset rejects everything as a duplicate. That's correct behaviour, so use `sim:demo` (it resets).
- Placeholder emails produce real sandbox payouts that end `UNCLAIMED` (money held 30 days), not `SUCCESS`.
- Simulators never print claimant emails, only `claimant#n`.
- Claims are verified inline in Phase 1: about 7–10 s each (Gemini, plus payout polling up to 60 s).
- `/api/sim/*` requires `x-reviewer-token`; don't expose it on the hosted demo without a token.

## Test
`npm run sim:demo -- --runs 3` exits 0 only if every run passes all checks: 6 donations captured, genuine APPROVED, genuine-2/3 parked in WAITING_FUNDS then released oldest first by wave 2, borderline IN_REVIEW, both fakes REJECTED, 3 SUCCESS payouts fully allocated in donation order.
