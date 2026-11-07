---
name: solana-trail
description: Use for the public Solana devnet trail — queueing donation/decision/payout records, the Token-2022 test-PYUSD + Memo transaction, retries without duplicates, explorer links, faucets, and never putting PII on chain.
---

# solana-trail

## Purpose
A public, tamper-evident record of every donation, decision (engine + reviewer) and successful payout.
Real money only moves through PayPal; the chain is the receipt anyone can check.

## Files it owns
- `lib/trail/index.ts` — `enqueueDonation/Decision/Payout(tx, …)`, `canonicalJson`, `rowHash`, `buildMemo`, `explorerTxUrl` (pure parts tested in `tests/trail.test.ts`)
- `lib/trail/worker.ts` — `processTrailQueue`, `startTrailWorker` (started in `instrumentation.ts`, every 15 s + after each enqueue)
- table `trail_entry` (one row per event, unique `(kind, ref_id)`); `solana_tx` on donation / decision / payout
- `lib/public/feed.ts` (`/api/trail`), `lib/public/receipt.ts`

## Env vars
`SOLANA_RPC_URL` (devnet only: refused otherwise), `SOLANA_TRAIL_WALLET_SECRET_KEY` (base58 or JSON byte array),
`PYUSD_DEVNET_MINT` (`CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM`, Token-2022 — verified on chain by check:env),
`SOLANA_EXPLORER_BASE`. All four missing → trail disabled, entries parked as DISABLED, nothing else changes.

## Memo
`RS|v1|<type>|<public_id>|<amount_usd>|<sha256 of row_json>` — type `donation`, `decision.approved|in_review|rejected`,
`payout`; public id = donor HMAC (`d_…`) or claim HMAC (`c_…`). `row_json` (public fields only; a reviewer's
free-text reason only as `reason_sha256`) is published on `/api/trail` so anyone can recompute the hash.

## Transaction (`@solana/web3.js` 1.99 + `@solana/spl-token` 0.4.15)
- `createTransferCheckedWithTransferHookInstruction(conn, ata, mint, ata, owner, 1n, decimals, [], "confirmed", TOKEN_2022_PROGRAM_ID)`
  — 0.000001 test PYUSD to the wallet's own associated token account (self-transfer), transfer-hook aware.
- Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, signer = trail wallet.
- No PYUSD account / zero balance → memo-only transaction (`mode = memo-only`), fees in devnet SOL.

## Exactly once, never blocking
- Enqueue happens inside the same DB transaction as the event; sending is background-only.
- Signature stored before `sendRawTransaction`; a rejected send (preflight) clears it and retries; an accepted but
  unconfirmed send stays SENT and the next pass asks the chain (`getSignatureStatuses`, history) before any resend;
  re-send only 2 min after the send (blockhash expired). Backoff 15 s × 2^n, max 8 attempts → FAILED (shown on /admin + dashboard).

## Faucets (free)
- Devnet SOL: https://faucet.solana.com (2 requests / 8 h without login; GitHub login for more). The RPC airdrop is closed on devnet.
- Test PYUSD: Paxos faucet / Google Cloud Web3 faucet (pages need a browser; not confirmed by fetch). Without it the trail runs memo-only.

## Test
`npm test` (pure parts) · `npm run check:env` (RPC, SOL balance, PYUSD balance + Token-2022 owner) · `npm run demo` prints every record with its explorer link.
