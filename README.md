# Relief Stream

**Charity-stream donations, paid directly to verified people in a disaster zone, with a receipt that shows where every dollar went.**

Entry for the PayPal *Build What's Next with PayPal and AI* hackathon. Everything runs on the **PayPal sandbox** with test money.

## The problem
You donate $10 to a charity stream. The money goes to an NGO or middleman, and you never learn whether it reached the people it was raised for.

## How Relief Stream works
1. Viewers donate with the PayPal button. Every donation lands in one PayPal **relief pool** (Orders v2).
2. People in the disaster zone submit a claim: location, photo, a typed message and/or a **voice note**, and their PayPal email.
3. **Five checks run in parallel** (Render Workflows tasks): the **location** against live GDACS/USGS disaster areas (plus an official alert page read by a Kernel cloud browser), the **photo** (EXIF, CLIP near-duplicate search in Elastic), the **voice note** (Groq Whisper), **uniqueness** (PayPal account, photo hash, CLIP) and **community vouching** (approved claims of the same event within 10 km, Elastic geo query).
4. **AI checks the evidence.** In one call per claim, Gemini (with Groq as a fallback) scores whether the photo shows damage that matches the disaster, whether the photo looks AI-generated, and whether the message or voice note is consistent with the event.
5. **Plain TypeScript decides.** A score ≥ 75 is paid automatically, 50–74 goes to a human reviewer (approve/reject with a reason, alerted through Zapier), below 50 is rejected. Code-proven fraud (duplicate account, reused or cropped photo, nowhere near a disaster) is rejected whatever the score; model-judged problems (AI-generated look, a story that contradicts the event) are never auto-paid and go to a human.
6. Verified people are paid **directly** with PayPal Payouts. No NGO or middleman holds the money.
7. Each payout is matched FIFO to the donations that funded it, so a donor's receipt names the exact claims their money reached.

Design: [architecture.md](architecture.md) · Plan and rules: [harness.md](harness.md)

## Status: Phase 2 (fraud-proof verification)
| Done | What |
| --- | --- |
| ✅ | Env checker with live PayPal / Gemini / Groq / Postgres / Elastic / Kernel / Zapier checks |
| ✅ | Next.js + TS strict + Tailwind + Prisma 7 (Render Postgres) + zod + vitest |
| ✅ | PayPal Orders v2 donate button, capture, webhook route (signature verify when configured, de-duplicated) |
| ✅ | Claim intake (photo + text and/or voice note), one-call AI assessment (Gemini Flash-Lite → Groq fallback, demo cache), deterministic decision engine |
| ✅ | Payouts with `sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>`, polling, FIFO allocation |
| ✅ | Stream page, status page, reviewer page, basic donor receipt, simulators, Postman collection |
| ✅ | Photo forensics: EXIF (missing ≠ fail), CLIP on CPU (transformers.js) + Elastic kNN near-duplicates (threshold 0.92, tuned on fixtures) |
| ✅ | Location: GDACS + USGS live event areas and a clearly labelled SIMULATED demo event through one code path; Kernel official-page corroboration with replay link |
| ✅ | Voice notes: Groq Whisper, language detection, transcript private, same single AI call |
| ✅ | Vouching: Elastic geo query (same event, 10 km, approved, non-duplicate) |
| ✅ | Render Workflows tasks (5 parallel checks → decision → payout; release task) with an inline fallback; `render.yaml`. The deploy uses free tiers only, so on Render verification runs inline (same code); the paid workflow service is one uncommented block away |
| ✅ | Reviewer screen with every signal's evidence and a required reason; Zapier review + ops alerts |
| ✅ | 11 demo claims: 3 genuine, 2 borderline, 6 fakes, each caught by the right check |
| ⏳ | Render deploy + live PayPal webhook (Phase 2, Step 5) |
| ⏳ | Phase 3: Solana trail, AG Grid dashboard, polished receipt, Astropods |

## Run it locally
Requirements: Node 20+ (tested on 24), a PostgreSQL database (Render Postgres works), a PayPal developer account, a free Gemini API key, a free Groq API key (vision fallback + Whisper), an Elastic Cloud Serverless project, and optionally a Kernel API key (free Developer plan) and two Zapier Catch Hooks.

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # then fill in the values (see below)
npm run check:env           # must pass before anything else
npx prisma migrate deploy   # or: npm run db:migrate (dev)
npm run elastic:setup       # creates the two Elastic indices (idempotent)
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
| `npm run check:env` | Reports every key as SET/MISSING (never prints values), runs sanity and live checks (1 Gemini call, 1 Groq call, Elastic ping, Kernel auth, 1 Zapier test POST; `-- --no-zapier` skips the POST) |
| `npm run dev` | Next.js dev server on :3000 |
| `npm test` | vitest unit tests (scoring + Phase 2 hard rules, thresholds, packets, FIFO, privacy, AI contract, geo, feeds, Kernel extraction, Whisper parsing, alert payloads, Elastic queries) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run paypal:smoke` | Creates a $1 sandbox order and checks it lands in the pool account |
| `npm run sim:stream` | Scripted sandbox donations (Ron $10, Rahul $25, …) |
| `npm run sim:claims` | 11 claims: 3 genuine, 2 borderline, 6 fakes (duplicate account, reused photo, cropped photo, AI-generated photo, outside any disaster, contradicting voice note) |
| `npm run sim:reset -- --yes` | Wipes demo rows (not PayPal balances) |
| `npm run sim:demo -- --runs 3` | reset → donation wave 1 ($85, funds one packet) → 11 claims → donation wave 2 ($215, auto-releases the waiting claims oldest first) → payout sync → checks, N times. Prints every claim's signals, decision and the check that caught each fake, PayPal ids, FIFO allocations and AI/Whisper/Kernel usage per run. `SIM_BASE_URL=<url>` runs it against a deployed app |
| `npm run elastic:setup` | Create the Elastic photos + claims indices |
| `npm run clip:tune` | CLIP similarity matrix of the fixture photos (how the 0.92 threshold was chosen) |
| `npm run clip:prefetch` | Download the CLIP model at build time |
| `npm run disasters:live` | Real GDACS/USGS lookup through the claim code path |
| `npm run alerts:test -- review\|ops` | One sample alert to the matching Zapier hook |

Pages: `/stream` (donate), `/admin` (status tables), `/review` (reviewer queue, needs `REVIEWER_ACCESS_TOKEN`), `/receipt/<donorPublicId>`.

API testing: import `postman/relief-stream.postman_collection.json` and `postman/relief-stream.local.postman_environment.json`.

## AI tools used
| Tool | Where | What it does |
| --- | --- | --- |
| **Google Gemini Flash-Lite** (`gemini-3.5-flash-lite` via `@google/genai`) | `lib/ai` | One vision + text call per claim. It scores whether the photo shows damage matching the disaster, whether it looks AI-generated, and whether the message is consistent with the event, and returns the language, red flags and a one-paragraph explanation for reviewers. Structured JSON output validated with zod. **It never decides or moves money.** |
| **Groq Whisper** (`whisper-large-v3-turbo`, free tier) | `lib/speech` | Transcribes claimants' voice notes and detects the language. The transcript stays private and joins the same single AI call. |
| **CLIP** (`Xenova/clip-vit-base-patch32`, ONNX, on CPU via `@huggingface/transformers`) | `lib/vision` | Image embeddings for near-duplicate detection (a cropped or re-compressed copy of an earlier claim's photo) via Elastic kNN. No API and no quota. |
| **Groq** (`qwen/qwen3.8-27b` vision, set by `GROQ_VISION_MODEL`) | `lib/ai` | Vision fallback only. If Gemini returns a quota error (429) or stays unavailable (503 or timeout) after backoff, the same request goes to Groq, and its answer is validated with the same zod contract. `/admin` shows which provider assessed each claim. A claim goes to human review only if both fail. |
| **Claude Code** (Anthropic) | the repo | Pair-programmed the codebase, project skills (`.claude/skills/`) and docs under the rules in `CLAUDE.md` / `harness.md`. |
| APIMatic Context Plugin | — | Planned for PayPal SDK context. It was not connected in the Phase 1 session; PayPal field names were checked against PayPal's official OpenAPI specs instead. |

**Sponsor tools in Phase 2:** Elastic Cloud Serverless (photo vectors + claims geo index, no PII), Kernel (cloud browser that reads the official NWS alert page; replay link saved for the video), Render Workflows (durable parallel checks and payouts), Zapier (review and ops alerts). NWS also offers a JSON alerts API; the Kernel step deliberately reads the human page to show a browser agent corroborating a disaster.

**Why free tiers.** The whole build runs on free AI quotas, with no paid API. Flash-Lite gives about 500 requests a day per project (Gemini Flash gives only 20, which ran out mid-demo). Groq's free tier is a second, independent quota. For the scripted demo, `AI_DEMO_CACHE` (on in development, off in production) reuses the validated AI result for the **fixture** claims only, keyed by photo hash + message hash + model + prompt version. Real claims always call the AI. So the demo can be repeated without burning quota, and judges' own claims are always assessed live.

## Safety rules the code enforces
- **Money decisions are code.** `lib/scoring` decides and sizes payouts; only `workflows/send-payout.ts` calls Payouts, and only after an APPROVED decision.
- **Reviewers can't change amounts or recipients.** The review API accepts `{action: approve|reject, reason}` only, and every decision is recorded.
- **Privacy:** public ids are HMACs, locations are rounded to a ~10 km grid (Elastic: ~1 km, private), photos and voice notes are deleted as soon as the claim is decided, transcripts are never public, and no email ever appears on a public page or in an alert.
- **Sandbox only:** the PayPal client refuses any non-sandbox base URL.
- **Idempotent:** `PayPal-Request-Id` on creates and captures, `sender_batch_id = <claim_public_id>-<claim row tag>-<attempt>`, webhooks de-duplicated by event id.

## Credits
Demo claim photos are public-domain FEMA images and one public-domain AI-generated image from Wikimedia Commons; the cropped fake is derived from one of them. The contradicting voice note is self-made with Windows text-to-speech. See [simulators/fixtures/photos/CREDITS.md](simulators/fixtures/photos/CREDITS.md) and [simulators/fixtures/audio/README.md](simulators/fixtures/audio/README.md).

## License
[MIT](LICENSE)
