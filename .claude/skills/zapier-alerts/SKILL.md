---
name: zapier-alerts
description: Use for reviewer and ops alerts — the two Zapier Catch Hooks (review queue, ops alerts), their payload shapes, when each fires, and how to set up and test the Zaps.
---

# zapier-alerts

## Purpose

Zapier tells humans when they are needed. Relief Stream POSTs JSON to two Catch Hooks through
`lib/alerts`; Zapier forwards to Slack or email. Alerts never block the money flow (fire-and-forget with
a 5 s timeout, failures logged without the URL).

## Files it owns

- `lib/alerts/index.ts` — `sendReviewAlert(...)`, `sendOpsAlert(...)`, pure payload builders
- Callers: `workflows/verify-claim.ts` (IN_REVIEW), `lib/ledger.ts` (pool low),
  `app/api/webhooks/paypal` + `/api/payouts/sync` (payout FAILED/UNCLAIMED), `lib/ai` callers (both AI down)

## Env vars

`ZAPIER_REVIEW_WEBHOOK_URL`, `ZAPIER_ALERT_WEBHOOK_URL` (two **different** Zaps), `APP_BASE_URL`
(review link), `POOL_LOW_USD` (default 100).

## Payloads (no emails, photos, messages or exact GPS)

Review (`kind: "review_needed"`):
```json
{ "kind": "review_needed", "claim_public_id": "c_…", "score": 61, "geo_cell": "38.75,-90.45",
  "red_flags": ["…"], "ai_explanation": "…", "review_url": "https://…/review?claim=c_…", "at": "ISO" }
```
Ops (`kind`: `pool_low` | `payout_failed` | `ai_down`):
```json
{ "kind": "payout_failed", "severity": "high", "summary": "Payout for c_… UNCLAIMED",
  "claim_public_id": "c_…", "detail": "…", "at": "ISO" }
```
Catch Hook reply on success: `{"status":"success", …}` (seen live from check:env).

## Zap setup (zapier.com; free-plan task limits: TODO: confirm on zapier.com/pricing)

1. **Review Zap.** Trigger: *Webhooks by Zapier → Catch Hook*. Copy the URL into
   `ZAPIER_REVIEW_WEBHOOK_URL`. Add a *Filter*: `kind` exactly matches `review_needed` (drops check:env
   tests). Action: *Slack → Send Channel Message* (or *Email by Zapier*). Message:
   `Claim {{claim_public_id}} needs review (score {{score}}). Flags: {{red_flags}}. {{review_url}}`.
2. **Ops Zap.** Same trigger with a new Catch Hook → `ZAPIER_ALERT_WEBHOOK_URL`. Action: Slack/email
   `[{{severity}}] {{kind}}: {{summary}}`.
3. Test: `npm run alerts:test -- review` / `-- ops` sends one sample of each, then *Test trigger* in Zapier.

## Gotchas

- A full demo run sends ≈ 3–4 alerts (each action run counts as a Zapier task; TODO: confirm filter billing).
- Dedupe: one review alert per claim per transition (key `review:<claim_public_id>`), one pool-low alert
  per hour.
- Never log the hook URL (it is a secret: anyone with it can post into your Slack).

## Test

- `tests/alerts.test.ts`: payload builders contain no email/message/lat/lon fields.
- `npm run check:env`: one test POST (`kind: "test"`), skip with `--no-zapier`.
