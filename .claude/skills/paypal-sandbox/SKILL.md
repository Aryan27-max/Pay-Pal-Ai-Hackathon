---
name: paypal-sandbox
description: Use for any PayPal call in Relief Stream — OAuth token, Orders v2 donations, the JS SDK donate button, webhooks and sandbox account setup.
---

# paypal-sandbox

## Purpose
Every PayPal REST call goes through `lib/paypal/`. Sandbox only (hard rule 5): `lib/paypal/client.ts` throws if `PAYPAL_API_BASE` does not contain `sandbox`.

## Files it owns
- `lib/paypal/client.ts`: OAuth token cache, `paypalFetch` (sets `PayPal-Request-Id`), `PayPalError`
- `lib/paypal/orders.ts`: create / capture / get order, sandbox card donation (simulator only), `extractCapture`
- `lib/paypal/webhooks.ts`: signature verification, event schema, payout-item resource reader
- `app/api/donations/create-order`, `app/api/donations/capture`, `app/api/webhooks/paypal`
- `app/stream/stream-client.tsx`: JS SDK button (`@paypal/react-paypal-js`)
- `scripts/paypal-smoke.ts` (`npm run paypal:smoke`)

## Env vars
`PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_API_BASE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same as client id), `PAYPAL_WEBHOOK_ID` (optional in Phase 1), `PAYPAL_POOL_BUSINESS_EMAIL`.

## Sources (do not guess field names)
PayPal OpenAPI specs: `github.com/paypal/paypal-rest-api-specifications/openapi/` (`checkout_orders_v2.json` v2.32, `notifications_webhooks_v1.json` v1.11) and developer.paypal.com/docs/api/orders/v2. The APIMatic Context Plugin should be used when it is connected.

## How to
1. **Token:** `POST {PAYPAL_API_BASE}/v1/oauth2/token`, Basic auth `client_id:secret`, body `grant_type=client_credentials`. Cached until `expires_in − 60 s`.
2. **Create order (button):**
   ```json
   POST /v2/checkout/orders   PayPal-Request-Id: <uuid>
   {"intent":"CAPTURE","purchase_units":[{"amount":{"currency_code":"USD","value":"10.00"},
     "description":"Relief Stream donation to the relief pool","custom_id":"main"}]}
   ```
   `amount.value` is a string. `custom_id` carries the stream id.
3. **Capture:** `POST /v2/checkout/orders/{id}/capture` with `PayPal-Request-Id: capture-{id}`, so a retried capture is idempotent. Read `purchase_units[0].payments.captures[0]` → `id`, `status`, `amount`. Payer: `payer.payer_id` / `payer.email_address`, used only to derive the HMAC donor id and never stored.
4. **Save donation:** `lib/ledger.recordDonation` upserts on `paypal_capture_id` and records only `status === "COMPLETED"`. The capture route, the webhook and any retry are all safe to call.
5. **JS SDK:** `PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}` + `PayPalButtons createOrder → /api/donations/create-order`, `onApprove → /api/donations/capture`.
6. **Webhooks:** `POST /v1/notifications/verify-webhook-signature` with `auth_algo, cert_url, transmission_id, transmission_sig, transmission_time` from headers `PAYPAL-AUTH-ALGO, PAYPAL-CERT-URL, PAYPAL-TRANSMISSION-ID, PAYPAL-TRANSMISSION-SIG, PAYPAL-TRANSMISSION-TIME`, plus `webhook_id` and `webhook_event`. A pass is `verification_status === "SUCCESS"`.
   - Events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED | FAILED | UNCLAIMED` (also BLOCKED, CANCELED, HELD, REFUNDED, RETURNED exist).
   - De-duplicate by `event.id` (PK of `webhook_event`).
   - **Never trust the payload for money:** re-fetch the order or payout batch from PayPal before writing anything.

## Sandbox setup
- developer.paypal.com → Apps & Credentials → **Sandbox** → app → client id/secret.
- The REST app must belong to the pool business account. `npm run paypal:smoke` checks this (`payee == PAYPAL_POOL_BUSINESS_EMAIL`).
- Testing Tools → Sandbox Accounts: personal accounts for donors (popup login) and claimants (payout receivers).
- Scripted donations (`sim:stream`) pay with a sandbox test card (`4012000033330026`, any future expiry, any CVV). This needs **Advanced Credit and Debit Card Payments** enabled on the sandbox app; otherwise PayPal returns `422 PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`. With card `payment_source`, `PayPal-Request-Id` is mandatory.

## Gotchas
- Order ids match `^[A-Z0-9]{1,36}$`; validate before putting one in a URL path.
- `Prefer: return=representation` gives the full order back.
- Sandbox is slow (1–3 s per call). Never call it from unit tests.
- TODO: confirm the full capture `status` enum and the `PAYMENT.CAPTURE.COMPLETED` path `resource.supplementary_data.related_ids.order_id` against a real sandbox event.
- Never log the client secret, the token or payer emails. `PayPalError` messages contain only name, message and debug_id.

## Test
- `npm run check:env` (live OAuth), `npm run paypal:smoke` (order + pool payee check).
- Postman: `postman/relief-stream.postman_collection.json` → *PayPal* folder (token, create order, get order).
