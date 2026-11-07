# Graph Report - relief-stream  (2026-11-08)

## Corpus Check
- 146 files · ~72,172 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 1099 nodes · 2431 edges · 54 communities (50 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c157253`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- json
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
- types.ts
- checks.ts
- ref_node_fs
- db
- ledger.ts
- trail/index.ts
- speech/index.ts
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
- env
- stream/route.ts
- ag-grid-dashboard
- newman.d.ts
- privacy/index.ts
- paypal/route.ts
- disasters/index.ts
- geo.ts
- usgs.ts
- dotenv
- @renderinc/sdk

## God Nodes (most connected - your core abstractions)
1. `env()` - 40 edges
2. `db` - 33 edges
3. `scripts` - 31 edges
4. `json()` - 27 edges
5. `errorResponse()` - 26 edges
6. `finalizeClaim()` - 26 edges
7. `main()` - 21 edges
8. `sendPayout()` - 18 edges
9. `architecture.md system design` - 18 edges
10. `zod` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Files it owns` --references--> `ensureIndices()`  [INFERRED]
  .claude/skills/elastic-search/SKILL.md → lib/search/client.ts
- `Purpose` --references--> `locate()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts
- `Test` --references--> `locate()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts
- `Files it owns` --references--> `activeEvents()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/index.ts
- `APIs (checked 2026-11-07)` --references--> `time()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → app/admin/page.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Privacy controls for public surfaces** — harness_privacy_rule, _claude_skills_privacy_guard_skill_claimpublicid, _claude_skills_privacy_guard_skill_geocell, _claude_skills_privacy_guard_skill_redactclaim, _claude_skills_gemini_ai_skill_pii_minimization, architecture_solana_trail [INFERRED 0.85]
- **Deterministic money pipeline (score -> decide -> size -> pay -> FIFO settle)** — harness_deterministic_money_logic, _claude_skills_claim_verification_skill_decide, _claude_skills_claim_verification_skill_packetfor, _claude_skills_paypal_payouts_skill_sendpayout, _claude_skills_paypal_payouts_skill_settlepayout, _claude_skills_claim_verification_skill_planfifoallocation [INFERRED 0.95]
- **Idempotency mechanisms across PayPal calls** — harness_idempotency_rule, _claude_skills_paypal_sandbox_skill_paypal_request_id, _claude_skills_paypal_payouts_skill_sender_batch_id, _claude_skills_paypal_sandbox_skill_webhook_dedup, _claude_skills_paypal_sandbox_skill_recorddonation [INFERRED 0.95]

## Communities (54 total, 4 thin omitted)

### Community 0 - "json"
Cohesion: 0.16
Nodes (24): dynamic, GET(), runtime, Body, POST(), runtime, POST(), POST() (+16 more)

### Community 1 - "verify-claim.ts"
Cohesion: 0.06
Nodes (59): Env vars, Files it owns, Gotchas, How to, photo-forensics, Purpose, Test, dropEvidence() (+51 more)

### Community 2 - "paypal/route.ts"
Cohesion: 0.11
Nodes (19): getAccessToken(), issuesOf(), PayPalConfig, PayPalError, paypalFetch(), PayPalRequest, Token, tokenCache (+11 more)

### Community 3 - "Demo Simulators"
Cohesion: 0.09
Nodes (42): OUT, submit(), ROOT, caughtBy(), ClaimRun, Detail, DONE(), emailFor() (+34 more)

### Community 4 - "Dev Dependencies"
Cohesion: 0.09
Nodes (31): devDependencies, cloudflared@^0.7.3, eslint@^9.39.5, eslint-config-next@^16.4.5, newman@^6.2.3, postcss@^8.5.32, tailwindcss@^4.3.5, @tailwindcss/postcss@^4.3.5 (+23 more)

### Community 5 - "Scoring Engine Concepts"
Cohesion: 0.12
Nodes (17): claim-verification skill, planFifoAllocation, scoringConfigFrom env validation, totalScore (weighted signal sum), VERIFIED_CLAIM_STATUSES (vouching), flood-zone.json demo zone, Next.js agent rules (read bundled docs, breaking changes), API surface (Next.js route handlers) (+9 more)

### Community 6 - "ai/index.ts"
Cohesion: 0.07
Nodes (49): AI_ASSESSMENT_JSON_SCHEMA, AiAssessment, AiAssessmentSchema, AiErrorClass, AiErrorKind, classifyAiError(), describeAiError(), MAX_INLINE_RETRY_MS (+41 more)

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
Cohesion: 0.08
Nodes (26): dependencies, ag-grid-community@^36.3.0, ag-grid-react@^36.3.0, bs58@^6.0.0, @elastic/elasticsearch@^9.5.1, exifr@^7.1.3, @google/genai@^3.0.0, pg@^8.23.1 (+18 more)

### Community 17 - "Payout Flow & Pool Guard"
Cohesion: 0.36
Nodes (9): packetFor packet sizing, pg_advisory_xact_lock pool reservation, Payout batch polling (3 s, 60 s), PayPal Payouts v1 API (POST /v1/payments/payouts), paypal-payouts skill, Pool-balance guard (remaining minus in-flight payouts), sendPayout(claimId) flow, settlePayout (idempotent FIFO settlement) (+1 more)

### Community 18 - "Project Harness Rules"
Cohesion: 0.25
Nodes (5): Repo layout, CLAUDE.md project harness, Working loop (orient, plan, skill, change, run, document, commit), Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...), Relief Stream skills index

### Community 19 - "search/client.ts"
Cohesion: 0.17
Nodes (22): Files it owns, ClaimDoc, claimDocument(), clearIndices(), countVouchers(), roundForIndex(), updateClaimStatus(), upsertClaimDoc() (+14 more)

### Community 20 - "Install Script Allowlist"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.1, @prisma/engines@7.10.1, protobufjs

### Community 23 - "types.ts"
Cohesion: 0.15
Nodes (12): APIs (checked 2026-11-07), Caching, disaster-feeds, Env vars, Gotchas, Purpose, Rules (pure, in lib/scoring + lib/disasters/geo), DisasterEvent (+4 more)

### Community 24 - "checks.ts"
Cohesion: 0.11
Nodes (28): VOUCH_STATUSES, elasticConfigured(), ExifInfo, readExif(), dHash(), hamming(), checkMessageStep(), checkPhotoStep() (+20 more)

### Community 25 - "ref_node_fs"
Cohesion: 0.12
Nodes (16): child, env, composeUp(), dockerOk(), readEnv(), run(), tcpOpen(), waitForStack() (+8 more)

### Community 26 - "db"
Cohesion: 0.18
Nodes (11): AlertResult, OpsAlertInput, OpsKind, opsPayload(), post(), ReviewAlertInput, reviewPayload(), sendOpsAlert() (+3 more)

### Community 27 - "ledger.ts"
Cohesion: 0.14
Nodes (26): dynamic, GET(), runtime, hourKey(), cents(), FAILED_PAYOUT_STATUSES, lockPool(), poolBalanceCents() (+18 more)

### Community 28 - "trail/index.ts"
Cohesion: 0.06
Nodes (52): day(), dynamic, hhmm(), metadata, money(), ReceiptPage(), Record(), Env vars (+44 more)

### Community 29 - "speech/index.ts"
Cohesion: 0.11
Nodes (27): AdminPage(), COLORS, dynamic, Provider(), Stat(), Status(), Table(), time() (+19 more)

### Community 30 - "services"
Cohesion: 0.12
Nodes (17): envVarGroups, envVars, name, fromGroup, key, sync, value, services (+9 more)

### Community 31 - "elasticsearch"
Cohesion: 0.09
Nodes (24): environment, healthcheck, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+16 more)

### Community 32 - "phase2-modules.test.ts"
Cohesion: 0.14
Nodes (17): cached(), inflight, memo, corroborateAlert(), extractHazards(), inUsBox(), KERNEL_TIMEOUT_MS, KernelCheck (+9 more)

### Community 33 - "render-workflows"
Cohesion: 0.18
Nodes (10): Blueprint (`render.yaml`, spec checked 2026-11-07), Cost (decision 2026-11-07: free tiers only → the deploy runs inline, workflow service commented out in render.yaml), Env vars, Files it owns, Gotchas, Idempotency, Purpose, render-workflows (+2 more)

### Community 34 - "kernel-browser"
Cohesion: 0.20
Nodes (9): API (kernel.sh docs + the SDK's .d.ts, checked 2026-11-07), Env vars, Files it owns, Gotchas, kernel-browser, Limits, Page and extraction, Purpose (+1 more)

### Community 35 - "clip.ts"
Cohesion: 0.15
Nodes (15): CLIP_DUPLICATE_THRESHOLD, CLIP_DTYPES, clipDtype(), clipModelId(), cosine(), CROP_VARIANTS, embedCrops(), embedImage() (+7 more)

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
Cohesion: 0.23
Nodes (12): activeGdacs(), Collection, DEFAULT_RADIUS_KM, Feature, gdacsEvents(), GdacsRaw, getJson(), polygonsFromGeometry() (+4 more)

### Community 43 - "env"
Cohesion: 0.17
Nodes (21): Fields, maxDuration, PHOTO_TYPES, POST(), runtime, Body, maxDuration, runtime (+13 more)

### Community 44 - "stream/route.ts"
Cohesion: 0.18
Nodes (16): Body, runtime, Body, maxDuration, runtime, CaptureSchema, createDonationOrder(), createSandboxCardDonation() (+8 more)

### Community 45 - "ag-grid-dashboard"
Cohesion: 0.25
Nodes (7): AG Grid Community 36 (MIT, free), ag-grid-dashboard, Files it owns, Layout, Privacy (privacy-guard), Purpose, Test

### Community 46 - "newman.d.ts"
Cohesion: 0.40
Nodes (4): newman, NewmanRunOptions, NewmanRunSummary, Stat

### Community 47 - "privacy/index.ts"
Cohesion: 0.13
Nodes (20): Files it owns, postman-collection, Rules, Run, claimPublicId(), donorPublicId(), GEO_CELL_DEG, geoCell() (+12 more)

### Community 48 - "paypal/route.ts"
Cohesion: 0.21
Nodes (15): POST(), runtime, recordDonation(), settlePayout(), getOrder(), getPayoutBatch(), summarizeBatch(), waitForPayout() (+7 more)

### Community 49 - "disasters/index.ts"
Cohesion: 0.19
Nodes (11): DisasterContext, activeEvents(), checkLocation(), disasterContext(), FeedStatus, LocationCheck, simulatedEnabled(), zone (+3 more)

### Community 50 - "geo.ts"
Cohesion: 0.31
Nodes (10): Files it owns, Test, distanceOutsideKm(), locate(), Located, pointInPolygon(), pointInRing(), pointToSegmentKm() (+2 more)

### Community 51 - "usgs.ts"
Cohesion: 0.38
Nodes (6): EVENT_ACTIVE_DAYS, Collection, Feature, quakeRadiusKm(), usgsEvents(), usgsToEvents()

### Community 52 - "dotenv"
Cohesion: 0.40
Nodes (4): dotenv@^18.0.9, prisma@7.10.1, dotenv, prisma

## Knowledge Gaps
- **11 isolated node(s):** `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)`, `Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...)`, `scoringConfigFrom env validation` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 417 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `stream/route.ts` to `json`, `paypal/route.ts`, `Demo Simulators`, `Dev Dependencies`, `ai/index.ts`, `gdacs.ts`, `env`, `paypal/route.ts`, `disasters/index.ts`, `dependencies`, `usgs.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `verify-claim.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05698778833107191 - nodes in this community are weakly interconnected._
- **Why does `db` connect `db` to `json`, `phase2-modules.test.ts`, `verify-claim.ts`, `Demo Simulators`, `ai/index.ts`, `env`, `Dashboard.tsx`, `privacy/index.ts`, `paypal/route.ts`, `disasters/index.ts`, `checks.ts`, `ledger.ts`, `trail/index.ts`, `speech/index.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `paypal/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11333333333333333 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `NPM Scripts` to `Dev Dependencies`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `Demo Simulators` be split into smaller, more focused modules?**
  _Cohesion score 0.09158249158249158 - nodes in this community are weakly interconnected._