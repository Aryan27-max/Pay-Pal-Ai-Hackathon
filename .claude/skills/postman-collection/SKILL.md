---
name: postman-collection
description: Use when adding or changing an API route — keep the Postman collection, its tests and environments in step, and run them with Newman.
---

# postman-collection

## Files it owns
- `postman/relief-stream.postman_collection.json` — folders: PayPal (sandbox), Internal API, Simulators
- `postman/relief-stream.local.postman_environment.json`, `postman/relief-stream.render.postman_environment.json` (no secrets committed)
- `scripts/newman-run.ts` → `npm run test:api`; `types/newman.d.ts`

## Rules
- Every route gets a request with `pm.test` assertions: status, shape, and **no email / transcript / replay URL** in public responses.
- Requests that need state read collection variables set by earlier tests (`orderId`, `claimPublicId`, `reviewClaimId`,
  `payoutBatchId`, `donorPublicId`) and skip cleanly (`pm.test("skipped: …", () => true); return;`) when the state isn't there.
- Never commit a filled environment. `newman-run.ts` writes a temporary one from `.env` in the OS temp folder and deletes it.
- Regexes inside JSON need doubled backslashes (`/^-?\\d+\\.\\d{2}$/`): a lost backslash silently matches a letter.

## Run
`npm run dev:local` then `npm run test:api` (resets demo data, makes one donation + one IN_REVIEW claim, runs Newman).
Last run: 22 requests, 40/40 assertions passed.
