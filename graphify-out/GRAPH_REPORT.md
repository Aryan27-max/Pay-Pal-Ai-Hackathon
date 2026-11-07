# Graph Report - relief-stream  (2026-11-07)

## Corpus Check
- 146 files · ~72,083 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 1097 nodes · 2427 edges · 49 communities (46 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4436b57`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- env
- verify-claim.ts
- paypal/route.ts
- Demo Simulators
- Dev Dependencies
- Scoring Engine Concepts
- ai/index.ts
- Privacy Guard Rules
- Reviewer & Stream Pages
- TypeScript Config
- check-env.ts
- Hackathon Plan & Fixtures
- NPM Scripts
- PayPal Sandbox Integration
- Dashboard.tsx
- Gemini Contract Concepts
- dependencies
- Payout Flow & Pool Guard
- Project Harness Rules
- search/client.ts
- Install Script Allowlist
- Vitest Config
- disasters/index.ts
- checks.ts
- ref_node_fs
- db
- ledger.ts
- trail/index.ts
- admin/page.tsx
- services
- elasticsearch
- phase2-modules.test.ts
- render-workflows
- kernel-browser
- clip.ts
- review/page.tsx
- speech-whisper
- zapier-alerts
- elastic-search
- How to record (phone or laptop, 10–20 seconds each)
- gdacs.ts
- send-payout.ts
- db.ts
- ag-grid-dashboard
- newman.d.ts
- postman-collection
- @solana/web3.js

## God Nodes (most connected - your core abstractions)
1. `env()` - 40 edges
2. `db` - 33 edges
3. `scripts` - 31 edges
4. `json()` - 27 edges
5. `finalizeClaim()` - 26 edges
6. `errorResponse()` - 26 edges
7. `main()` - 21 edges
8. `sendPayout()` - 18 edges
9. `architecture.md system design` - 18 edges
10. `zod` - 17 edges

## Surprising Connections (you probably didn't know these)
- `APIs (checked 2026-11-07)` --references--> `time()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → app/admin/page.tsx
- `Rules (pure, in lib/scoring + lib/disasters/geo)` --references--> `time()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → app/admin/page.tsx
- `Files it owns` --references--> `ensureIndices()`  [INFERRED]
  .claude/skills/elastic-search/SKILL.md → lib/search/client.ts
- `Test` --references--> `locate()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts
- `Files it owns` --references--> `exifFactor()`  [INFERRED]
  .claude/skills/photo-forensics/SKILL.md → lib/scoring/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Privacy controls for public surfaces** — harness_privacy_rule, _claude_skills_privacy_guard_skill_claimpublicid, _claude_skills_privacy_guard_skill_geocell, _claude_skills_privacy_guard_skill_redactclaim, _claude_skills_gemini_ai_skill_pii_minimization, architecture_solana_trail [INFERRED 0.85]
- **Deterministic money pipeline (score -> decide -> size -> pay -> FIFO settle)** — harness_deterministic_money_logic, _claude_skills_claim_verification_skill_decide, _claude_skills_claim_verification_skill_packetfor, _claude_skills_paypal_payouts_skill_sendpayout, _claude_skills_paypal_payouts_skill_settlepayout, _claude_skills_claim_verification_skill_planfifoallocation [INFERRED 0.95]
- **Idempotency mechanisms across PayPal calls** — harness_idempotency_rule, _claude_skills_paypal_sandbox_skill_paypal_request_id, _claude_skills_paypal_payouts_skill_sender_batch_id, _claude_skills_paypal_sandbox_skill_webhook_dedup, _claude_skills_paypal_sandbox_skill_recorddonation [INFERRED 0.95]

## Communities (49 total, 3 thin omitted)

### Community 0 - "env"
Cohesion: 0.05
Nodes (92): dynamic, GET(), runtime, Fields, maxDuration, PHOTO_TYPES, POST(), runtime (+84 more)

### Community 1 - "verify-claim.ts"
Cohesion: 0.05
Nodes (62): Env vars, Files it owns, Gotchas, How to, photo-forensics, Purpose, Test, dropEvidence() (+54 more)

### Community 2 - "paypal/route.ts"
Cohesion: 0.11
Nodes (17): getAccessToken(), issuesOf(), PayPalConfig, PayPalError, PayPalRequest, Token, tokenCache, BATCH_STATUSES (+9 more)

### Community 3 - "Demo Simulators"
Cohesion: 0.08
Nodes (47): clearIndices(), dotenv@^18.0.9, dotenv, OUT, submit(), main(), PHOTOS, ROOT (+39 more)

### Community 4 - "Dev Dependencies"
Cohesion: 0.08
Nodes (33): devDependencies, cloudflared@^0.7.3, eslint@^9.39.5, eslint-config-next@^16.4.5, newman@^6.2.3, postcss@^8.5.32, prisma@7.10.1, tailwindcss@^4.3.5 (+25 more)

### Community 5 - "Scoring Engine Concepts"
Cohesion: 0.12
Nodes (17): claim-verification skill, planFifoAllocation, scoringConfigFrom env validation, totalScore (weighted signal sum), VERIFIED_CLAIM_STATUSES (vouching), flood-zone.json demo zone, Next.js agent rules (read bundled docs, breaking changes), API surface (Next.js route handlers) (+9 more)

### Community 6 - "ai/index.ts"
Cohesion: 0.05
Nodes (68): budgetExhaustedMessage(), BudgetGuard, BudgetProvider, dailyBudget(), dbBudget, DEFAULT_BUDGET, usageToday(), utcDay() (+60 more)

### Community 7 - "Privacy Guard Rules"
Cohesion: 0.16
Nodes (17): CLAIM_ID_SALT, claimPublicId HMAC (c_ + 20 hex), donorPublicId HMAC (d_ + 20 hex), geoCell 0.1 degree grid (~10 km), privacy-guard skill, Private claim fields (email, lat, lon, message, photo), redactClaim, Privacy review checklist (+9 more)

### Community 8 - "Reviewer & Stream Pages"
Cohesion: 0.16
Nodes (11): dynamic, StreamPage(), AMOUNTS, ChatLine, FAKE_CHAT, Pool, Receipt, Stat() (+3 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "check-env.ts"
Cohesion: 0.09
Nodes (37): EnvLike, isSet(), ServiceDef, serviceEnabled(), ServiceId, SERVICES, ServiceStatus, serviceStatuses() (+29 more)

### Community 11 - "Hackathon Plan & Fixtures"
Cohesion: 0.20
Nodes (15): Claim fixtures (3 genuine, 2 borderline, 2 fakes), demo-simulators skill, fake-reused-photo fixture, sim:demo repeatable demo run, Build plan Nov 7-12, Definition of done, Demo script (<= 2:50), Goals in priority order (+7 more)

### Community 12 - "NPM Scripts"
Cohesion: 0.06
Nodes (31): scripts, alerts:test, build, check:env, check:robustness, clip:prefetch, clip:tune, db:generate (+23 more)

### Community 13 - "PayPal Sandbox Integration"
Cohesion: 0.20
Nodes (11): Scripted sandbox test-card donations, PayPal JS SDK donate button, OAuth client-credentials token cache, Orders v2 create / capture, PayPal-Request-Id idempotency header, paypal-sandbox skill, paypal:smoke pool payee check, lib/ledger recordDonation upsert (+3 more)

### Community 14 - "Dashboard.tsx"
Cohesion: 0.07
Nodes (33): dynamic, GET(), runtime, Badge(), ChainCell(), ClaimCell(), Dashboard(), DonorCell() (+25 more)

### Community 15 - "Gemini Contract Concepts"
Cohesion: 0.24
Nodes (7): Five signal builders (photo, location, message, uniqueness, vouching), fake-duplicate-account fixture, AiAssessmentSchema zod contract / parseAssessment, assessClaim() Gemini call, gemini-ai skill, sanitizeError (strip API key), Gemini output contract

### Community 16 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, ag-grid-community@^36.3.0, ag-grid-react@^36.3.0, bs58@^6.0.0, @elastic/elasticsearch@^9.5.1, exifr@^7.1.3, @google/genai@^3.0.0, @huggingface/transformers@^4.3.2 (+22 more)

### Community 17 - "Payout Flow & Pool Guard"
Cohesion: 0.36
Nodes (9): packetFor packet sizing, pg_advisory_xact_lock pool reservation, Payout batch polling (3 s, 60 s), PayPal Payouts v1 API (POST /v1/payments/payouts), paypal-payouts skill, Pool-balance guard (remaining minus in-flight payouts), sendPayout(claimId) flow, settlePayout (idempotent FIFO settlement) (+1 more)

### Community 18 - "Project Harness Rules"
Cohesion: 0.25
Nodes (5): Repo layout, CLAUDE.md project harness, Working loop (orient, plan, skill, change, run, document, commit), Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...), Relief Stream skills index

### Community 19 - "search/client.ts"
Cohesion: 0.19
Nodes (19): Files it owns, ClaimDoc, claimDocument(), countVouchers(), roundForIndex(), updateClaimStatus(), upsertClaimDoc(), vouchQuery() (+11 more)

### Community 20 - "Install Script Allowlist"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.1, @prisma/engines@7.10.1, protobufjs

### Community 23 - "disasters/index.ts"
Cohesion: 0.09
Nodes (31): APIs (checked 2026-11-07), Caching, disaster-feeds, Env vars, Files it owns, Gotchas, Purpose, Rules (pure, in lib/scoring + lib/disasters/geo) (+23 more)

### Community 24 - "checks.ts"
Cohesion: 0.11
Nodes (31): getEvidence(), disasterContext(), VOUCH_STATUSES, elasticConfigured(), ExifInfo, readExif(), dHash(), hamming() (+23 more)

### Community 25 - "ref_node_fs"
Cohesion: 0.12
Nodes (16): child, env, composeUp(), dockerOk(), readEnv(), run(), tcpOpen(), waitForStack() (+8 more)

### Community 26 - "db"
Cohesion: 0.27
Nodes (10): AlertResult, OpsAlertInput, OpsKind, opsPayload(), post(), ReviewAlertInput, reviewPayload(), sendOpsAlert() (+2 more)

### Community 27 - "ledger.ts"
Cohesion: 0.21
Nodes (14): dynamic, GET(), runtime, cents(), FAILED_PAYOUT_STATUSES, lockPool(), poolBalanceCents(), poolSummary() (+6 more)

### Community 28 - "trail/index.ts"
Cohesion: 0.06
Nodes (52): day(), dynamic, hhmm(), metadata, money(), ReceiptPage(), Record(), Env vars (+44 more)

### Community 29 - "admin/page.tsx"
Cohesion: 0.36
Nodes (8): AdminPage(), COLORS, dynamic, Provider(), Stat(), Status(), Table(), time()

### Community 30 - "services"
Cohesion: 0.12
Nodes (17): envVarGroups, envVars, name, fromGroup, key, sync, value, services (+9 more)

### Community 31 - "elasticsearch"
Cohesion: 0.09
Nodes (24): environment, healthcheck, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+16 more)

### Community 32 - "phase2-modules.test.ts"
Cohesion: 0.16
Nodes (18): cached(), corroborateAlert(), extractHazards(), inUsBox(), KERNEL_TIMEOUT_MS, KernelCheck, kernelEnabled(), MATCHERS (+10 more)

### Community 33 - "render-workflows"
Cohesion: 0.18
Nodes (10): Blueprint (`render.yaml`, spec checked 2026-11-07), Cost (decision 2026-11-07: free tiers only → the deploy runs inline, workflow service commented out in render.yaml), Env vars, Files it owns, Gotchas, Idempotency, Purpose, render-workflows (+2 more)

### Community 34 - "kernel-browser"
Cohesion: 0.20
Nodes (9): API (kernel.sh docs + the SDK's .d.ts, checked 2026-11-07), Env vars, Files it owns, Gotchas, kernel-browser, Limits, Page and extraction, Purpose (+1 more)

### Community 35 - "clip.ts"
Cohesion: 0.18
Nodes (11): CLIP_DUPLICATE_THRESHOLD, clipModelId(), cosine(), CROP_VARIANTS, embedCrops(), embedImage(), load(), Loaded (+3 more)

### Community 36 - "review/page.tsx"
Cohesion: 0.25
Nodes (7): Detail, evidenceFor(), ReviewClaim, ReviewPage(), WEIGHTS, react@^19.3.1, react

### Community 37 - "speech-whisper"
Cohesion: 0.22
Nodes (8): Env vars, Files it owns, Gotchas, How to, Limits (free tier), Purpose, speech-whisper, Test

### Community 38 - "zapier-alerts"
Cohesion: 0.22
Nodes (8): Env vars, Files it owns, Gotchas, Payloads (no emails, photos, messages or exact GPS), Purpose, Test, Zap setup (zapier.com; free-plan task limits: TODO: confirm on zapier.com/pricing), zapier-alerts

### Community 39 - "elastic-search"
Cohesion: 0.29
Nodes (6): elastic-search, Env vars, Gotchas, How to, Purpose, Test

### Community 41 - "How to record (phone or laptop, 10–20 seconds each)"
Cohesion: 0.33
Nodes (5): fake-contradictory-voice (already here), genuine-1-en (English, about 15 s), genuine-3-hi (Hindi, about 15 s), How to record (phone or laptop, 10–20 seconds each), Voice-note fixtures

### Community 42 - "gdacs.ts"
Cohesion: 0.21
Nodes (13): activeGdacs(), Collection, DEFAULT_RADIUS_KM, EVENT_ACTIVE_DAYS, Feature, gdacsEvents(), GdacsRaw, getJson() (+5 more)

### Community 43 - "send-payout.ts"
Cohesion: 0.33
Nodes (9): hourKey(), createPayout(), scoringConfigFrom(), alertIfPoolLow(), PAYABLE_STATES, ReleasedClaim, retryWaitingFunds(), sendPayout() (+1 more)

### Community 44 - "db.ts"
Cohesion: 0.25
Nodes (3): inflight, memo, g

### Community 45 - "ag-grid-dashboard"
Cohesion: 0.25
Nodes (7): AG Grid Community 36 (MIT, free), ag-grid-dashboard, Files it owns, Layout, Privacy (privacy-guard), Purpose, Test

### Community 46 - "newman.d.ts"
Cohesion: 0.40
Nodes (4): newman, NewmanRunOptions, NewmanRunSummary, Stat

### Community 47 - "postman-collection"
Cohesion: 0.50
Nodes (3): Files it owns, postman-collection, Run

### Community 48 - "@solana/web3.js"
Cohesion: 0.33
Nodes (4): react-dom@^19.3.1, @solana/web3.js@^1.99.0, react-dom, @solana/web3.js

## Knowledge Gaps
- **11 isolated node(s):** `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)`, `Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...)`, `scoringConfigFrom env validation` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 416 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `env` to `phase2-modules.test.ts`, `paypal/route.ts`, `Demo Simulators`, `Dev Dependencies`, `ai/index.ts`, `gdacs.ts`, `dependencies`, `disasters/index.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `env` be split into smaller, more focused modules?**
  _Cohesion score 0.05064836003051106 - nodes in this community are weakly interconnected._
- **Why does `db` connect `db` to `env`, `verify-claim.ts`, `phase2-modules.test.ts`, `Demo Simulators`, `ai/index.ts`, `send-payout.ts`, `db.ts`, `Dashboard.tsx`, `disasters/index.ts`, `checks.ts`, `ledger.ts`, `trail/index.ts`, `admin/page.tsx`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `verify-claim.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0546583850931677 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `NPM Scripts` to `Dev Dependencies`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `paypal/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11067193675889328 - nodes in this community are weakly interconnected._