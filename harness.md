# harness.md — How Claude works on Relief Stream

This is the operating manual for every prompt in this repo. Read it with `CLAUDE.md`, `architecture.md` and `SKILL.md` before doing any work.

## 1. What we are building

**Relief Stream** is an entry for the **PayPal "Build What's Next with PayPal and AI" hackathon** (Devpost).

**Problem:** when a streamer runs a charity stream, the money goes to an NGO or middleman and donors never learn whether it reached the people it was raised for.

**Solution:** donations go into one PayPal relief pool. AI agents verify each person asking for help. Verified people are paid **directly** through PayPal Payouts, with **no NGO or middleman holding the money**. Every donation, decision and payout is written to a public Solana devnet trail (test PYUSD) using anonymous IDs only. Each donor gets a receipt link that traces their money to the claim it funded.

**The test for every feature:** if we removed the AI, would this stop working? If not, the AI is decoration. Cut it or make it matter.

## 2. Hackathon facts (do not forget)

- **Deadline:** Nov 12, 2026, 3:00 PM EST (Nov 13, 1:30 AM IST). Aim to be feature-complete by Nov 11.
- **Must have:** meaningful PayPal + meaningful AI; working demo (hosted URL or full run instructions); public repo with LICENSE at root; README listing every AI tool and how it is used; demo video under 3 minutes on YouTube with no copyrighted music or third-party logos.
- **Judging:** Technological Implementation, Design, Potential Impact, Innovation, Presentation.
- **Prizes we target:** 1st–3rd, Most Impactful, Best Use of PayPal + AI, Best Demo Delivery, Best Use of AG Grid, Best Use of APIMatic, Best Use of Render.

## 3. Goals, in priority order

1. The full loop works live in sandbox: donate → claim → verify → pay out → public trail → donor receipt.
2. A planted fraud (reused or AI-generated photo, duplicate claimant) is caught on screen.
3. The public dashboard and donor receipt make the transparency obvious in 5 seconds.
4. Deployed on Render with seeded sandbox accounts so judges can try it in 2 minutes.
5. README, Postman collection and video ready.

Anything not serving these goals waits until after submission.

## 4. Companies and their exact jobs

Use only these. Do not add other sponsors.

| Company | Job in Relief Stream |
| --- | --- |
| **PayPal** | JS SDK + Orders v2 for donations; Webhooks to confirm them; Payouts API to send packets; Agent Toolkit so agents can call PayPal tools. Sandbox only. |
| **Gemini (Google AI Studio)** | All LLM work: message consistency check, photo-vs-disaster vision check, final explanation. Called only through `lib/ai`. |
| **Whisper** | Voice note → text. Local for the hackathon, Groq in production. Called only through `lib/speech`. |
| **CLIP** (Hugging Face / Elastic inference) | Image embeddings for duplicate and near-duplicate photo detection. |
| **Elastic** | Stores photo embeddings and claims; kNN search for reused photos; geo search for nearby claims (community vouching). |
| **Render** | Hosts the Next.js app and Postgres; **Render Workflows** runs each verification step as a durable, retryable task. |
| **Kernel** | Cloud browser that checks official disaster alert pages that have no API. |
| **Zapier** | Alerts reviewers when a claim lands in the 50–74 band; alerts on pool low / payout failed. |
| **Postman** | Collection for every internal and PayPal API call; shipped in the repo for judges. |
| **APIMatic** | Context Plugin in Claude Code so PayPal SDK code is correct. Note its use in the README. |
| **AG Grid** | Public transparency dashboard and reviewer queue. |
| **Solana devnet + test PYUSD** | Public, checkable trail of donations, decisions and payouts. |

## 5. Non-negotiable rules

1. **Money logic is deterministic.** The AI produces signal scores and an explanation. Plain TypeScript decides approve / review / reject and the amount. The AI can never call Payouts directly.
2. **Thresholds:** score ≥ 75 → auto payout; 50–74 → human review; < 50 → reject (appealable). A failed uniqueness check rejects regardless of score. First packet $50–$100, capped by `MAX_FIRST_PACKET_USD`.
3. **No middlemen.** Money flows pool → claimant only. Reviewers can approve or reject; they cannot change amounts or recipients. Every reviewer decision is written to the trail.
4. **Privacy.** No names, emails, photos, phone numbers or exact GPS on-chain or on the public dashboard. Public data uses `claim_id = HMAC(CLAIM_ID_SALT, paypal_email)`, a rounded location (~10 km grid) and hashes.
5. **Sandbox only.** No live PayPal credentials, no mainnet Solana.
6. **Secrets** live in `.env`. Never print, log or commit them.
7. **Idempotency.** Every payout uses `sender_batch_id = claim_id + attempt`; webhooks are de-duplicated by event ID.
8. **Every external call** goes through a wrapper in `lib/` so it can be mocked and swapped (e.g. Gemini → another model).

## 6. How to work (every task)

1. **Orient cheaply.** If `graphify-out/` exists, read `graphify-out/GRAPH_REPORT.md` and query the graph before grepping or opening files. Open only the files you need.
2. **Check the plan.** Find the task in `architecture.md`. If the change alters the design, update `architecture.md` first.
3. **Load the right skill** from `.claude/skills/` (see `SKILL.md`).
4. **Small steps.** One feature per change. Write or update a test or a Postman request with it.
5. **Verify.** Run the tests / the Postman request / the simulator. Do not say something works unless you ran it.
6. **Record.** Update `README.md` if setup changed; tick the build checklist below; commit with a clear message.
7. **Rebuild the graph** after big changes: `graphify update .` (or `/graphify .`).
8. **When unsure** about a PayPal API shape, use the APIMatic Context Plugin or the official docs. Never guess field names for money calls.

## 7. Graphify setup (token saving)

Run once, after the first scaffold exists:

```bash
pip install graphifyy
graphify install            # installs the skill
graphify claude install     # adds CLAUDE.md section + hook so Claude uses the graph
```

Then in Claude Code: `/graphify .`

Outputs `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.html`. Commit `graph.json` and `GRAPH_REPORT.md`; ignore the cache.

## 8. Build plan (Nov 7 → Nov 12)

- [x] **Phase 1 (Nov 7): core money loop.** Sandbox donations (Orders v2) → claim intake → one AI call per claim (Gemini Flash-Lite, Groq fallback, demo cache) → deterministic scoring → Payouts with FIFO allocation; `/admin`; `npm run sim:demo -- --runs 3` passes 3/3.
  - [ ] Manual PayPal button donation: through the tunnel (see Phase 2)
- [x] **Phase 2 (Nov 7): fraud-proof verification** — five parallel checks → one AI call → deterministic decision; reviewer screen; Zapier alerts. Plan changed to zero-cost, local first (Docker), so "deploy" moved to the end.
  - [x] Local `npm run demo -- --runs 3` (cache on) + 1 live run (cache off): every fake caught by the right check, 4/4 runs
  - [x] Recovery sweep, dHash + multi-crop near-duplicates, race lock (`npm run check:robustness`), reviewer e2e (`npm run test:e2e`)
  - [x] Guards: check:env per phase (`--core` for judges), AI daily budget, graceful degradation
  - [x] PayPal webhook via `npm run tunnel` + `PAYPAL_WEBHOOK_ID`, real signed webhooks verified (Nov 8: 3 PayPal-signed PAYMENT.PAYOUTS-ITEM.SUCCEEDED events stored; a resend of the same 3 was de-duplicated, payouts and allocations unchanged; a fake unsigned event → 400 `signature_verification_failed`)
  - [ ] Manual PayPal button donation (US donor) through the tunnel
  - [x] Confirm both Zapier test emails arrived (alerts:test review + ops sent OK; arrival confirmed by the user, Nov 8)
  - [ ] Record the two voice clips (`simulators/fixtures/audio/README.md`)
- [ ] **Phase 3: public trail + transparency (local, free)**
  - [x] Solana trail queue + worker (Token-2022 test PYUSD + Memo), on every donation/decision/payout
  - [x] Trail on chain: wallet funded with devnet SOL (Nov 8); all 21 queued records CONFIRMED (memo-only: no test PYUSD yet), finalized on devnet, explorer links on receipts
  - [x] AG Grid public dashboard `/dashboard`, donor receipts `/receipt/[id]`, `/api/trail`, `/api/receipts/:id`
  - [x] Postman via Newman (`npm run test:api`, 40/40), judge-ready README
  - [ ] PayPal Agent Toolkit: skipped (no payouts tool; direct tool calls undocumented)
  - [x] Deploy prep: peak 416 MB on the production server (CLIP q4 + lean ONNX + 192 MB heap cap; was 538 MB), all fakes still caught; plan = Render free web + Neon free Postgres
  - [ ] Deploy: not for the submission (decision Nov 8). We submit with local run instructions; `render.yaml` kept, README → Deployment (optional)
  - [x] Free-tier deploy prep (Nov 11): Render free web + Neon free Postgres; no hosted Elasticsearch needed (CLIP crops stored/compared in Postgres `photo_embedding` when `ELASTIC_URL` is empty, same rule); `CLIP_MODE=off` escape hatch; setup/dev:local skip Docker for a hosted DB; `render.yaml` complete (Solana + budgets)
  - [ ] Free-tier deploy live: deploy the Blueprint with a Neon DATABASE_URL, then `npm run demo` against the Render URL
- [x] **Submission readiness (Nov 8)**
  - [x] `npm run demo -- --runs 3` 3/3 (cache on); 1 live run on `next start` (cache off: 7 Gemini calls, 30/400 today)
  - [x] 127 unit tests, typecheck, `test:e2e`, Newman 22/22 requests · 40/40 assertions, `check:robustness`
  - [x] `next build && next start`: /stream, /dashboard, /receipt, /review load (200)
  - [x] Fresh-clone judge test from GitHub with core keys only: `setup` → `check:env -- --core` → `dev:local` → `demo` 1/1 (fixed: first `setup` now stops with the key list and generates the salt + reviewer token)
  - [x] Secret scan of all tracked files and full git history: 0 secret values; `.env` never committed
  - [x] README final: problem, solution, 5-line architecture, Run in 10 minutes, sandbox setup, AI + sponsor tools, zero-cost design, Deployment (optional), known limits, LICENSE
- [ ] **Day 1 (Nov 7):** scaffold Next.js + TS + Postgres (Prisma); `lib/paypal` with OAuth token, Orders create/capture, webhook verify; donate button works in sandbox; Postman collection started.
- [ ] **Day 2 (Nov 8):** claim intake API + claim simulator; `lib/ai` (Gemini), `lib/speech` (Whisper), EXIF reader; disaster feeds (GDACS, USGS); signal scorers.
- [ ] **Day 3 (Nov 9):** Elastic + CLIP duplicate check and nearby-claims vouching; scoring engine + thresholds; Render Workflows pipeline; Zapier review alert; reviewer screen.
- [ ] **Day 4 (Nov 10):** Payouts API; Solana devnet trail with test PYUSD memo; AG Grid public dashboard; donor receipt page; Kernel alert-page check.
- [ ] **Day 5 (Nov 11):** deploy on Render; seed data; end-to-end run with the scripted demo; README, LICENSE, Postman export, architecture image.
- [ ] **Day 6 (Nov 12, before 3 PM EST):** record and upload video; submit on Devpost.

## 9. Demo script (≤ 2:50)

1. **0:00–0:20** Problem: "You donate to a charity stream. Where does your $10 actually go?"
2. **0:20–0:50** Stream simulator: Ron and Rahul donate with PayPal; the pool fills live.
3. **0:50–1:40** Claim simulator fires: a genuine flood claim scores 86 → paid in seconds; a borderline one goes to review (Zapier alert pops); **a reused photo is caught** by Elastic + CLIP and rejected.
4. **1:40–2:15** Public dashboard (AG Grid) + Solana explorer link; Ron opens his receipt: "your $10 → claim A7, flood zone, verified 3:42 PM".
5. **2:15–2:50** Architecture slide (PayPal, Gemini, Groq, Elastic, Render, Kernel, Zapier, Postman, AG Grid, Solana) and why it matters.

## 10. Definition of done (for the whole project)

- Fresh clone + `.env` + documented commands → app runs locally.
- Hosted URL works with the seeded sandbox logins in the README.
- All five demo moments above work three times in a row.
- README states every AI tool and what it does, the license is visible, the video link is in the submission.
