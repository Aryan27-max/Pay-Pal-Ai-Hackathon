# Relief Stream

**Charity-stream donations, paid directly to verified people in a disaster zone, with a receipt that shows where every dollar went.**

Entry for the PayPal *Build What's Next with PayPal and AI* hackathon. Everything runs on the **PayPal sandbox** with test money.

## The problem
You donate $10 to a charity stream. The money goes to an NGO or middleman, and you never learn whether it reached the people it was raised for.

## How Relief Stream works
1. Viewers donate with the PayPal button. Every donation lands in one PayPal **relief pool** (Orders v2).
2. People in the disaster zone submit a claim: location, photo, message and their PayPal email.
3. **AI checks the evidence.** In one call per claim, Gemini (with Groq as a fallback) scores whether the photo shows damage that matches the disaster, whether the photo looks AI-generated, and whether the message is consistent with the event. Code checks location, uniqueness and community vouching.
4. **Plain TypeScript decides.** A score ≥ 75 is paid automatically, 50–74 goes to a human reviewer (approve/reject only), below 50 is rejected. A duplicate account or a reused photo is rejected whatever the score.
5. Verified people are paid **directly** with PayPal Payouts. No NGO or middleman holds the money.
6. Each payout is matched FIFO to the donations that funded it, so a donor's receipt names the exact claims their money reached.

Design: [architecture.md](architecture.md) · Plan and rules: [harness.md](harness.md)

## Status: Phase 1 (core money loop)
| Done | What |
| --- | --- |
| ✅ | Env checker with live PayPal / Gemini / Groq / Postgres checks |
| ✅ | Next.js + TS strict + Tailwind + Prisma 7 (Render Postgres) + zod + vitest |
| ✅ | PayPal Orders v2 donate button, capture, webhook route (signature verify when configured, de-duplicated) |
| ✅ | Claim intake, one-call AI assessment (Gemini Flash-Lite → Groq fallback, demo cache), five signals, deterministic decision engine (77 unit tests) |
| ✅ | Payouts with `sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>`, polling, FIFO allocation |
| ✅ | Stream page, status page, reviewer page, basic donor receipt, simulators, Postman collection |
| ⏳ | Phase 2: Render Workflows, Elastic + CLIP, Whisper, GDACS/USGS, Solana trail, Zapier |
| ⏳ | Phase 3: AG Grid dashboard, polished receipt, Render deploy, Kernel, Astropods |

## Run it locally
Requirements: Node 20+ (tested on 24), a PostgreSQL database (Render Postgres works), a PayPal developer account, a free Gemini API key and (recommended) a free Groq API key.

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # then fill in the values (see below)
npm run check:env           # must pass before anything else
npx prisma migrate deploy   # or: npm run db:migrate (dev)
npm run dev                 # http://localhost:3000
```

### PayPal sandbox setup
**Use US sandbox accounts.** The app, the pool business account, donors and claimants should all be **United States** sandbox accounts. PayPal hasn't supported domestic India-to-India payments since April 2021, and Advanced Credit and Debit Card payments aren't available to India accounts. With India sandbox accounts, card donations and payouts fail. Everything is in USD.

1. developer.paypal.com → **Apps & Credentials → Sandbox** → create an app. Put its client id and secret in `.env`. The app's business account **is the relief pool**, so set `PAYPAL_POOL_BUSINESS_EMAIL` to that account's email. `npm run paypal:smoke` confirms orders land there.
2. **Testing Tools → Sandbox Accounts**: create personal accounts.
   - Donors log into these in the PayPal popup. Put 3 of them in `SIM_DONOR_EMAILS` (comma-separated) for the manual `/stream` test.
   - Six claimant accounts receive relief payouts. Put them in `SIM_CLAIMANT_EMAILS` (comma-separated).
3. For scripted donations (`npm run sim:stream`), enable **Advanced Credit and Debit Card Payments** on the sandbox app. The simulator pays with a PayPal sandbox test card, so no popup is needed.
4. Optional: add a webhook pointing to `<APP_BASE_URL>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`.

## Commands
| Command | What it does |
| --- | --- |
| `npm run check:env` | Reports every key as SET/MISSING (never prints values), runs sanity and live checks |
| `npm run dev` | Next.js dev server on :3000 |
| `npm test` | vitest unit tests (scoring, thresholds, packets, FIFO, privacy, AI contract) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run paypal:smoke` | Creates a $1 sandbox order and checks it lands in the pool account |
| `npm run sim:stream` | Scripted sandbox donations (Ron $10, Rahul $25, …) |
| `npm run sim:claims` | 7 claims: 3 genuine, 2 borderline, 2 planted fakes (`-- --placeholder` for example.com emails) |
| `npm run sim:reset -- --yes` | Wipes demo rows (not PayPal balances) |
| `npm run sim:demo -- --runs 3` | reset → donation wave 1 ($85, funds one packet) → 7 claims → donation wave 2 ($215, auto-releases the waiting claims oldest first) → payout sync → checks, N times. Prints PayPal ids, FIFO allocations and AI calls per run |

Pages: `/stream` (donate), `/admin` (status tables), `/review` (reviewer queue, needs `REVIEWER_ACCESS_TOKEN`), `/receipt/<donorPublicId>`.

API testing: import `postman/relief-stream.postman_collection.json` and `postman/relief-stream.local.postman_environment.json`.

## AI tools used
| Tool | Where | What it does |
| --- | --- | --- |
| **Google Gemini Flash-Lite** (`gemini-3.5-flash-lite` via `@google/genai`) | `lib/ai` | One vision + text call per claim. It scores whether the photo shows damage matching the disaster, whether it looks AI-generated, and whether the message is consistent with the event, and returns the language, red flags and a one-paragraph explanation for reviewers. Structured JSON output validated with zod. **It never decides or moves money.** |
| **Groq** (`qwen/qwen3.8-27b` vision, set by `GROQ_VISION_MODEL`) | `lib/ai` | Fallback only. If Gemini returns a quota error (429) or stays unavailable (503 or timeout) after backoff, the same request goes to Groq, and its answer is validated with the same zod contract. `/admin` shows which provider assessed each claim. A claim goes to human review only if both fail. |
| **Claude Code** (Anthropic) | the repo | Pair-programmed the codebase, project skills (`.claude/skills/`) and docs under the rules in `CLAUDE.md` / `harness.md`. |
| APIMatic Context Plugin | — | Planned for PayPal SDK context. It was not connected in the Phase 1 session; PayPal field names were checked against PayPal's official OpenAPI specs instead. |

Planned (Phase 2): Whisper (voice notes → text), CLIP embeddings in Elastic (near-duplicate photos).

**Why free tiers.** The whole build runs on free AI quotas, with no paid API. Flash-Lite gives about 500 requests a day per project (Gemini Flash gives only 20, which ran out mid-demo). Groq's free tier is a second, independent quota. For the scripted demo, `AI_DEMO_CACHE` (on in development, off in production) reuses the validated AI result for the **fixture** claims only, keyed by photo hash + message hash + model + prompt version. Real claims always call the AI. So the demo can be repeated without burning quota, and judges' own claims are always assessed live.

## Safety rules the code enforces
- **Money decisions are code.** `lib/scoring` decides and sizes payouts; only `workflows/send-payout.ts` calls Payouts, and only after an APPROVED decision.
- **Reviewers can't change amounts or recipients.** The review API accepts `{action: approve|reject}` only.
- **Privacy:** public ids are HMACs, locations are rounded to a ~10 km grid, photos aren't stored, and no email ever appears on a public page.
- **Sandbox only:** the PayPal client refuses any non-sandbox base URL.
- **Idempotent:** `PayPal-Request-Id` on creates and captures, `sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>`, webhooks de-duplicated by event id.

## Credits
Demo claim photos are public-domain FEMA images from Wikimedia Commons. See [simulators/fixtures/photos/CREDITS.md](simulators/fixtures/photos/CREDITS.md).

## License
[MIT](LICENSE)
