---
name: paypal-payouts
description: Use when sending relief packets to verified claimants with PayPal Payouts, retrying failed payouts, or settling payout status.
---

# paypal-payouts

## Purpose
Move money pool → claimant directly, only after `lib/scoring` (or a reviewer approve) produced an APPROVED decision. The AI never reaches this code.

## Files it owns
- `lib/paypal/payouts.ts`: `createPayout`, `getPayoutBatch`, `summarizeBatch`, `waitForPayout`, `senderBatchId`
- `workflows/send-payout.ts`: the only caller: guards, packet sizing, reservation, polling, `syncPendingPayouts`, `retryWaitingFunds`
- `lib/ledger.ts`: `poolBalanceCents`, `settlePayout` (FIFO allocations), pool advisory lock
- `app/api/payouts/sync`: operator re-poll

## Env vars
`DEFAULT_PACKET_USD`, `MAX_FIRST_PACKET_USD`, PayPal vars from `paypal-sandbox`.

## Source
`payments_payouts_batch_v1.json` v1.9 (PayPal OpenAPI specs).

## Flow (`sendPayout(claimId)`)
1. In one transaction under `pg_advisory_xact_lock`:
   - claim status ∈ {APPROVED, WAITING_FUNDS, PAYOUT_FAILED}
   - latest `Decision.outcome === "APPROVED"`
   - no payout in flight or already SUCCESS
   - `packetFor(cfg, poolBalanceCents)`. If the pool is short → claim `WAITING_FUNDS` (no partial packets).
   - `attempt = payouts for claim + 1`; insert `Payout{status: CREATED, sender_batch_id}`; claim → `PAYOUT_PENDING`
2. `POST /v1/payments/payouts` (`PayPal-Request-Id` = sender_batch_id):
   ```json
   {"sender_batch_header":{"sender_batch_id":"c_<20hex>-<8hex row tag>-1","recipient_type":"EMAIL",
      "email_subject":"…","email_message":"…"},
    "items":[{"recipient_type":"EMAIL","receiver":"<claim email>",
      "amount":{"value":"50.00","currency":"USD"},"note":"…","sender_item_id":"c_<20hex>"}]}
   ```
   Response: `batch_header.payout_batch_id`, `batch_header.batch_status` (`PENDING` after preliminary checks).
3. Poll `GET /v1/payments/payouts/{payout_batch_id}` every 3 s for up to 60 s.
   - batch enum: `DENIED PENDING PROCESSING SUCCESS CANCELED`
   - item `transaction_status` enum: `SUCCESS FAILED PENDING UNCLAIMED RETURNED ONHOLD BLOCKED REFUNDED REVERSED`
   - final item states: everything except `PENDING` / `ONHOLD`
4. `settlePayout`: on SUCCESS, FIFO-allocate across `Donation.remaining_usd` (oldest first), decrement, claim → `PAID`. Other final states → claim `PAYOUT_FAILED`.

## Idempotency and retry
- `sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>` (row tag = first 8 hex of the claim uuid), unique in the DB. PayPal pays a given sender_batch_id at most once within 30 days and answers a reused one with `400 USER_BUSINESS_ERROR`. The row tag is why a demo reset (same claimant email, so the same claim_public_id) can never collide with an earlier run.
- Retry = a new attempt number (`PAYOUT_FAILED → PAYOUT_PENDING`), never re-using a sender_batch_id.
- `settlePayout` is idempotent (returns early if already SUCCESS). The poller and the webhook may both report.

## Pool-balance guard
`available = Σ donation.remaining_usd − Σ payout.amount where status ∈ {CREATED, PENDING, PROCESSING, ONHOLD, UNCLAIMED, UNKNOWN}`. UNCLAIMED stays reserved: PayPal holds the money for 30 days, then returns it.

## Gotchas
- Sandbox receivers must be sandbox **personal** accounts to reach `SUCCESS`. Unknown emails end `UNCLAIMED`.
- The REST app's own account funds payouts. It must be the pool business account (`npm run paypal:smoke`).
- `PHONE` recipient type is not supported in sandbox.
- Reviewers can't pass an amount or recipient; the review route's zod body is `.strict()` with only `action` + `note`.
- TODO: confirm where `payout_item_id` / `payout_batch_id` sit in `PAYMENT.PAYOUTS-ITEM.*` webhook `resource` (we read both defensively and re-fetch the batch).

## Test
- `npm test` → `tests/scoring.test.ts` (`packetFor`, `planFifoAllocation`).
- `npm run sim:demo` → checks every genuine payout reaches SUCCESS and is fully allocated.
- Postman: *Internal* → `POST /api/payouts/sync`; *PayPal* → `GET payout batch`.
