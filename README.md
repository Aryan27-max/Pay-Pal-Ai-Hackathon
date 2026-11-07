# Relief Stream

**Charity-stream donations, paid directly to verified people in a disaster zone, with a public receipt that shows where every dollar went.**

Entry for the PayPal *Build What's Next with PayPal and AI* hackathon. Everything runs on the **PayPal sandbox** (test money) and **Solana devnet**. It runs entirely on your machine for **$0**: free tiers, free open-source tools and local containers only.

## The problem
You donate $10 to a charity stream. The money goes to an NGO or middleman, and you never learn whether it reached the people it was raised for.

## How it works
1. Viewers donate with the PayPal button. Every donation lands in one PayPal **relief pool** (Orders v2).
2. People in the disaster zone submit a claim: GPS, a photo, a typed message and/or a **voice note**, and their PayPal email.
3. **Five checks run in parallel:**
   - **location** against live GDACS/USGS disaster areas, plus an official alert page read by a Kernel cloud browser;
   - **photo**: EXIF, plus near-duplicate search with multi-crop CLIP and a perceptual hash;
   - **voice note**: transcribed by Groq Whisper;
   - **uniqueness**: PayPal account, photo hash and near-duplicates;
   - **community vouching**: approved claims of the same event within 10 km.
4. **One AI call per claim** (Gemini Flash-Lite, Groq as fallback) scores the evidence. It checks three things:
   - whether the photo shows damage that matches the disaster;
   - whether the photo looks AI-generated;
   - whether the story fits the event.
5. **Plain TypeScript decides** (`lib/scoring`). A score of 75 or more is paid automatically, 50–74 goes to a human reviewer (approve or reject, with a written reason), and below 50 is rejected.
   - **Rejected outright:** fraud the code can prove, i.e. a duplicate account, a reused or edited photo, or a location nowhere near a disaster.
   - **Never paid automatically, sent to a human:** problems an AI judges, i.e. a photo that looks AI-generated or a story that contradicts the event.
6. Verified people are paid **directly** with PayPal Payouts, with no NGO or middleman holding the money. Each payout is matched FIFO (oldest donations first) to the donations that funded it.
7. Every donation, decision and payout is written to a **public trail** on Solana devnet as a test-PYUSD transfer with a memo (`RS|v1|<type>|<public_id>|<amount>|<sha256>`). Only anonymous ids are used. The **dashboard** and each donor's **receipt** show where every dollar went.

Design: [architecture.md](architecture.md) · Plan and rules: [harness.md](harness.md)

## Run it locally (about 10 minutes)

**You need:** Node 20+ (tested on 24), **Docker Desktop** (free), a **PayPal developer account** (free; sandbox) and a **Gemini API key** (free, [aistudio.google.com](https://aistudio.google.com)). Nothing else is required: every other service is optional and switches off cleanly.

```bash
git clone https://github.com/Adish7Pandya/relief-stream.git && cd relief-stream
npm run setup                 # installs; starts local Postgres + Elasticsearch in Docker; migrates; creates
                              # the indices; downloads the CLIP model; seeds. Creates .env on the first run.
# put your PayPal sandbox + Gemini keys in .env (below), then:
npm run check:env -- --core   # checks only what you need: PayPal sandbox, Gemini, Postgres
npm run dev:local             # http://localhost:3000
npm run demo                  # in a second terminal: the scripted demo (≈ 4 min), prints receipt links
```

Then open **http://localhost:3000/dashboard** (where the money went), a receipt link printed by the demo, **/review** (the reviewer queue; it needs `REVIEWER_ACCESS_TOKEN`) and **/admin** (status, AI budget, services).

### Keys
| Needed? | Keys | Where |
| --- | --- | --- |
| **Core** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same value), `PAYPAL_POOL_BUSINESS_EMAIL` | developer.paypal.com → Apps & Credentials → **Sandbox** (setup below) |
| **Core** | `SIM_DONOR_EMAILS` (3), `SIM_CLAIMANT_EMAILS` (6) | developer.paypal.com → Testing Tools → Sandbox Accounts (US Personal) |
| **Core** | `GEMINI_API_KEY` | aistudio.google.com → Get API key (free) |
| **Core** | `CLAIM_ID_SALT`, `REVIEWER_ACCESS_TOKEN` | any long random strings: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Optional | `GROQ_API_KEY` | console.groq.com (free): AI fallback + voice notes |
| Optional | `KERNEL_API_KEY` | dashboard.onkernel.com (free Developer plan): official alert-page check |
| Optional | `ZAPIER_REVIEW_WEBHOOK_URL`, `ZAPIER_ALERT_WEBHOOK_URL` | two Zapier Catch Hooks (free plan) |
| Optional | `SOLANA_TRAIL_WALLET_SECRET_KEY` (+ RPC, mint, explorer defaults) | any devnet wallet; fund it at faucet.solana.com (free) |
| Optional | `PAYPAL_WEBHOOK_ID` | after `npm run tunnel` (below) |

`DATABASE_URL` and `ELASTIC_URL` already point to the local containers.

**What happens when an optional key is missing.** `/admin` and `check:env` show the service as "disabled: no key"; nothing crashes:

| Missing key | Effect |
| --- | --- |
| Groq | No AI fallback (a Gemini failure sends the claim to review); voice notes aren't transcribed. |
| Kernel | Location uses the feeds only. |
| Zapier | No alerts. Use the /review queue. |
| Solana | No on-chain records. Payouts are unaffected. |

Full table: [architecture.md](architecture.md) §5.

### PayPal sandbox setup
**Use US sandbox accounts** for the app, the pool business account, donors and claimants. PayPal hasn't supported domestic India-to-India payments since April 2021, and Advanced Credit and Debit Card payments aren't available to India accounts. Everything is in USD.

1. developer.paypal.com → **Apps & Credentials → Sandbox** → create an app. Put its client id and secret in `.env`. The app's business account **is the relief pool**: set `PAYPAL_POOL_BUSINESS_EMAIL` to its email. `npm run paypal:smoke` checks that orders land there.
2. **Testing Tools → Sandbox Accounts**: create US personal accounts, 3 donors (`SIM_DONOR_EMAILS`) and 6 claimants (`SIM_CLAIMANT_EMAILS`), comma-separated.
3. For the scripted donations, enable **Advanced Credit and Debit Card Payments** on the sandbox app. The simulator pays with a PayPal sandbox test card.

### PayPal webhooks and the PayPal button, through a free tunnel
`npm run tunnel` opens a **Cloudflare quick tunnel** (free, no account) to your local app and prints the steps:
- add `<tunnel-url>/api/webhooks/paypal` as a sandbox webhook (capture completed, payout item succeeded / failed / unclaimed);
- copy its id into `PAYPAL_WEBHOOK_ID`, then restart `npm run dev:local`.

The tunnel URL changes every time, so register the webhook again each time. Without a webhook the app still works: payouts are settled by polling.

## Commands
| Command | What it does |
| --- | --- |
| `npm run setup` | One-time setup (Docker stack, migrations, indices, CLIP model, seed) |
| `npm run dev:local` | Local stack + Next.js on :3000 |
| `npm run demo -- --runs 3` | Scripted demo, run N times. Each run: donations → 12 claims → second donation wave → payouts → public trail → checks. Prints signals, decisions, which check caught each fake, PayPal ids, Solana links, receipt links, and AI calls vs budget |
| `npm run check:env` / `-- --core` | Every key SET/MISSING/SKIP per phase, plus cheap live checks (values are never printed) |
| `npm test` · `npm run typecheck` | 127 unit tests (vitest) · `tsc --noEmit` |
| `npm run test:e2e` | Reviewer flow in a real browser (Playwright; uses your Chrome or Edge) |
| `npm run test:api` | Postman collection via Newman against the local app |
| `npm run check:robustness` | Live race + recovery proofs |
| `npm run tunnel` | Free public HTTPS URL for PayPal webhooks |
| `npm run clip:tune` · `npm run disasters:live` · `npm run alerts:test -- review\|ops` | Photo-similarity matrix · real GDACS/USGS lookup · one test alert |
| `npm run sim:reset -- --yes` · `npm run stack:down` | Wipe demo data · stop the containers |

## What the demo shows
There are 12 fixture claims: 3 genuine, 2 borderline and **7 planted fakes**. Each fake must be stopped by the right check:

| Fake | Caught by | Outcome |
| --- | --- | --- |
| Same photo again, another account | photo SHA-256 | REJECTED |
| Second claim from one PayPal account | account match | REJECTED |
| Cropped + re-compressed copy | multi-crop CLIP + dHash near-duplicate | REJECTED |
| Heavy edit (crop + resize + brightness) | multi-crop CLIP near-duplicate | REJECTED |
| AI-generated flood photo | Gemini AI-generated risk + evidence floor | IN_REVIEW (a human decides) |
| Claimant 1,200 km from any disaster | location rule (> 100 km from every active event) | REJECTED |
| Voice note about another disaster | message check (Whisper → AI) + evidence floor | IN_REVIEW |

## AI tools used
| Tool | Where | What it does |
| --- | --- | --- |
| **Google Gemini Flash-Lite** (`gemini-3.5-flash-lite`, `@google/genai`) | `lib/ai` | One vision + text call per claim. It scores whether the photo shows damage that matches the disaster, whether it looks AI-generated, and whether the typed message or voice note fits the event. It also returns red flags and an explanation for reviewers. The output is JSON checked with zod. **It never decides or moves money.** |
| **Groq** vision (`qwen/qwen3.8-27b`) | `lib/ai` | Fallback when Gemini is rate-limited, down or over its daily budget. Same request, same zod contract. |
| **Groq Whisper** (`whisper-large-v3-turbo`) | `lib/speech` | Voice note → text plus language. The transcript stays private. |
| **CLIP** (`Xenova/clip-vit-base-patch32`, ONNX on CPU via `@huggingface/transformers`) | `lib/vision` | Image embeddings for near-duplicate photos, 7 crops per photo. Runs locally: no API, no quota. |
| **Claude Code** (Anthropic) | the repo | Pair-programmed the code, tests, project skills (`.claude/skills/`) and docs under the rules in `CLAUDE.md` / `harness.md`. |

## Sponsor tools and where they are used
| Sponsor | Used for | Where | Status |
| --- | --- | --- | --- |
| **PayPal** | Orders v2 donations, JS SDK button, Payouts, webhooks (signature-verified) | `lib/paypal/*`, `app/stream` | ✅ sandbox |
| **Gemini** | Evidence scoring (see above) | `lib/ai` | ✅ free tier |
| **Elastic** | Photo vectors (kNN near-duplicates) + claims geo index (vouching) | `lib/search/*` | ✅ local Elasticsearch 9.5 in Docker (Elastic Cloud optional) |
| **Kernel** | Cloud browser reads the official NWS alert page; replay link saved | `lib/disasters/kernel.ts` | ✅ free Developer plan |
| **Zapier** | Reviewer alerts + ops alerts (pool low, payout failed, AI down) | `lib/alerts` | ✅ |
| **Solana devnet + test PYUSD** | Public trail: Token-2022 test-PYUSD transfer + Memo per event | `lib/trail/*` | ✅ code; needs a funded devnet wallet |
| **AG Grid Community** | Public dashboard | `app/dashboard` | ✅ MIT |
| **Postman** | Collection + environments; run with Newman | `postman/`, `npm run test:api` | ✅ |
| **Render** | Workflows tasks (5 parallel checks, payout, release) | `workflows/render.ts`, `render.yaml` | Built, not deployed: Workflows has no free tier, so verification runs inline |
| **APIMatic** | PayPal SDK context | — | Not used. PayPal field names were checked against PayPal's official docs and OpenAPI specs |

## Zero-cost design choices
- **Local first:** Postgres and Elasticsearch run in Docker, CLIP runs on your CPU, and the tunnel is a free Cloudflare quick tunnel.
- **Free AI tiers only:**
  - **Daily budget:** the `AI_DAILY_CALL_BUDGET_GEMINI` (400) and `_GROQ` (800) guards are counted in Postgres. At the budget the app falls back to the other provider, or sends the claim to review with the reason.
  - **Demo cache:** the scripted demo reuses validated results for its fixture claims only (`AI_DEMO_CACHE`, on in development), so repeating it costs no AI calls. Real claims always call the AI.
- **Graceful degradation:** only PayPal sandbox, Gemini and Postgres are required.
- **No paid hosting needed** to try it: judges run it locally with the commands above.

## Safety rules the code enforces
- **Money decisions are code.** `lib/scoring` decides and sizes payouts. Only `workflows/send-payout.ts` calls Payouts, and only after an APPROVED decision.
- **Reviewers can't change amounts or recipients.** The review API accepts `{action, reason}` only. Every decision is recorded and goes on the public trail; the reason itself is stored only as a hash.
- **Privacy:**
  - public ids are HMACs, and public locations are rounded to a ~10 km grid;
  - photos and voice notes are deleted once the claim is decided, and transcripts are never public;
  - no email ever appears on a public page, in an alert or on chain.
- **Sandbox and devnet only:** the PayPal client refuses non-sandbox URLs, and the trail refuses non-devnet RPCs.
- **Idempotent and recoverable:**
  - idempotency: `PayPal-Request-Id`, a unique `sender_batch_id` per claim and attempt, webhooks de-duplicated, one trail entry per event;
  - recovery: a sweep re-runs claims stuck mid-verification without ever deciding or paying twice.

## Known limits
- A heavy edit can get past the near-duplicate check when CLIP places it near other flood photos (measured; see architecture.md §5).
- The disaster areas come from GDACS polygons or radius heuristics. Kernel reads one official page (NWS, US only).
- In dev mode, the first page you open after starting the server may reload a few times while it compiles. Seen in a OneDrive-synced folder.
- Test money only. A real deployment needs PayPal production approval, Enterprise Payouts for PYUSD, and a privacy review.

## Credits
Demo claim photos are public-domain FEMA images and one public-domain AI-generated image from Wikimedia Commons. The cropped and heavy-edit fakes are derived from one of them. The contradicting voice note is self-made with Windows text-to-speech. See [simulators/fixtures/photos/CREDITS.md](simulators/fixtures/photos/CREDITS.md) and [simulators/fixtures/audio/README.md](simulators/fixtures/audio/README.md).

## License
[MIT](LICENSE)
