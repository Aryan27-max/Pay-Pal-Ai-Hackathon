# Graph Report - Pay-Pal-Ai-Hackathon  (2026-11-11)

## Corpus Check
- 150 files · ~77,131 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 1152 nodes · 2529 edges · 61 communities (55 shown, 6 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db9e7e80`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- json
- scoring/index.ts
- payouts.ts
- db.ts
- package.json
- architecture.md system design
- ai-fallback.test.ts
- privacy-guard skill
- stream-client.tsx
- compilerOptions
- check-env.ts
- harness.md operating manual
- scripts
- paypal-sandbox skill
- Dashboard.tsx
- gemini-ai skill
- dependencies
- paypal-payouts skill
- Relief Stream skills index
- phase2-modules.test.ts
- allowScripts
- vitest
- disasters/index.ts
- checks.ts
- setup.mjs
- alerts/index.ts
- send-payout.ts
- trail/index.ts
- speech/index.ts
- services
- elasticsearch
- kernel.ts
- render-workflows
- kernel-browser
- clip.ts
- review/page.tsx
- speech-whisper
- zapier-alerts
- elastic-search
- How to record (phone or laptop, 10–20 seconds each)
- 20261106233323_init/migration.sql
- env
- orders.ts
- ag-grid-dashboard
- newman.d.ts
- privacy/index.ts
- paypal/route.ts
- verify-claim.ts
- photos-pg.ts
- contract.ts
- dotenv
- ai/index.ts
- providers.ts
- admin/page.tsx
- playwright-core
- 20261107174034_trail_queue/migration.sql
- 20261107091024_ai_provider_and_demo_cache/migration.sql
- 20261107160521_ai_usage_budget/migration.sql

## God Nodes (most connected - your core abstractions)
1. `env()` - 40 edges
2. `db` - 33 edges
3. `scripts` - 32 edges
4. `json()` - 27 edges
5. `errorResponse()` - 26 edges
6. `finalizeClaim()` - 26 edges
7. `main()` - 21 edges
8. `checkPhotoStep()` - 18 edges
9. `sendPayout()` - 18 edges
10. `architecture.md system design` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Files it owns` --references--> `ensureIndices()`  [INFERRED]
  .claude/skills/elastic-search/SKILL.md → lib/search/client.ts
- `APIs (checked 2026-11-07)` --references--> `time()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → app/admin/page.tsx
- `Test` --references--> `locate()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts
- `Rules (pure, in lib/scoring + lib/disasters/geo)` --references--> `time()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → app/admin/page.tsx
- `Files it owns` --references--> `pointInPolygon()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Privacy controls for public surfaces** — harness_privacy_rule, _claude_skills_privacy_guard_skill_claimpublicid, _claude_skills_privacy_guard_skill_geocell, _claude_skills_privacy_guard_skill_redactclaim, _claude_skills_gemini_ai_skill_pii_minimization, architecture_solana_trail [INFERRED 0.85]
- **Deterministic money pipeline (score -> decide -> size -> pay -> FIFO settle)** — harness_deterministic_money_logic, _claude_skills_claim_verification_skill_decide, _claude_skills_claim_verification_skill_packetfor, _claude_skills_paypal_payouts_skill_sendpayout, _claude_skills_paypal_payouts_skill_settlepayout, _claude_skills_claim_verification_skill_planfifoallocation [INFERRED 0.95]
- **Idempotency mechanisms across PayPal calls** — harness_idempotency_rule, _claude_skills_paypal_sandbox_skill_paypal_request_id, _claude_skills_paypal_payouts_skill_sender_batch_id, _claude_skills_paypal_sandbox_skill_webhook_dedup, _claude_skills_paypal_sandbox_skill_recorddonation [INFERRED 0.95]

## Communities (61 total, 6 thin omitted)

### Community 0 - "json"
Cohesion: 0.14
Nodes (27): dynamic, GET(), runtime, POST(), POST(), runtime, dynamic, GET() (+19 more)

### Community 1 - "scoring/index.ts"
Cohesion: 0.07
Nodes (43): Env vars, Files it owns, Gotchas, How to, photo-forensics, Purpose, Test, AI_GENERATED_FLAG (+35 more)

### Community 2 - "payouts.ts"
Cohesion: 0.11
Nodes (16): getAccessToken(), issuesOf(), PayPalConfig, PayPalError, PayPalRequest, Token, tokenCache, BATCH_STATUSES (+8 more)

### Community 3 - "db.ts"
Cohesion: 0.07
Nodes (48): AiAssessmentSchema, PROMPT_VERSION, db, g, OUT, submit(), ROOT, FILE (+40 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (31): devDependencies, cloudflared@^0.7.3, eslint@^9.39.5, eslint-config-next@^16.4.5, newman@^6.2.3, postcss@^8.5.32, tailwindcss@^4.3.5, @tailwindcss/postcss@^4.3.5 (+23 more)

### Community 5 - "architecture.md system design"
Cohesion: 0.12
Nodes (17): claim-verification skill, planFifoAllocation, scoringConfigFrom env validation, totalScore (weighted signal sum), VERIFIED_CLAIM_STATUSES (vouching), flood-zone.json demo zone, Next.js agent rules (read bundled docs, breaking changes), API surface (Next.js route handlers) (+9 more)

### Community 6 - "ai-fallback.test.ts"
Cohesion: 0.16
Nodes (15): AssessmentCache, CachedAssessment, cacheKey(), dbCache, demoCacheEnabled(), evidenceKey(), fixturePairs(), isFixtureClaim() (+7 more)

### Community 7 - "privacy-guard skill"
Cohesion: 0.16
Nodes (17): CLAIM_ID_SALT, claimPublicId HMAC (c_ + 20 hex), donorPublicId HMAC (d_ + 20 hex), geoCell 0.1 degree grid (~10 km), privacy-guard skill, Private claim fields (email, lat, lon, message, photo), redactClaim, Privacy review checklist (+9 more)

### Community 8 - "stream-client.tsx"
Cohesion: 0.16
Nodes (11): dynamic, StreamPage(), AMOUNTS, ChatLine, FAKE_CHAT, Pool, Receipt, Stat() (+3 more)

### Community 9 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "check-env.ts"
Cohesion: 0.09
Nodes (37): EnvLike, isSet(), ServiceDef, serviceEnabled(), ServiceId, SERVICES, ServiceStatus, serviceStatuses() (+29 more)

### Community 11 - "harness.md operating manual"
Cohesion: 0.22
Nodes (14): Claim fixtures (3 genuine, 2 borderline, 2 fakes), demo-simulators skill, fake-reused-photo fixture, sim:demo repeatable demo run, Build plan Nov 7-12, Definition of done, Demo script (<= 2:50), Goals in priority order (+6 more)

### Community 12 - "scripts"
Cohesion: 0.06
Nodes (32): scripts, alerts:test, build, check:env, check:robustness, clip:prefetch, clip:tune, db:generate (+24 more)

### Community 13 - "paypal-sandbox skill"
Cohesion: 0.20
Nodes (11): Scripted sandbox test-card donations, PayPal JS SDK donate button, OAuth client-credentials token cache, Orders v2 create / capture, PayPal-Request-Id idempotency header, paypal-sandbox skill, paypal:smoke pool payee check, lib/ledger recordDonation upsert (+3 more)

### Community 14 - "Dashboard.tsx"
Cohesion: 0.07
Nodes (33): dynamic, GET(), runtime, Badge(), ChainCell(), ClaimCell(), Dashboard(), DonorCell() (+25 more)

### Community 15 - "gemini-ai skill"
Cohesion: 0.22
Nodes (8): Five signal builders (photo, location, message, uniqueness, vouching), fake-duplicate-account fixture, AiAssessmentSchema zod contract / parseAssessment, assessClaim() Gemini call, gemini-ai skill, sanitizeError (strip API key), Gemini output contract, AI tools used (Gemini, Claude Code, APIMatic planned)

### Community 16 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, ag-grid-community@^36.3.0, ag-grid-react@^36.3.0, bs58@^6.0.0, @elastic/elasticsearch@^9.5.1, exifr@^7.1.3, @onkernel/sdk@^0.142.0, pg@^8.23.1 (+20 more)

### Community 17 - "paypal-payouts skill"
Cohesion: 0.36
Nodes (9): packetFor packet sizing, pg_advisory_xact_lock pool reservation, Payout batch polling (3 s, 60 s), PayPal Payouts v1 API (POST /v1/payments/payouts), paypal-payouts skill, Pool-balance guard (remaining minus in-flight payouts), sendPayout(claimId) flow, settlePayout (idempotent FIFO settlement) (+1 more)

### Community 18 - "Relief Stream skills index"
Cohesion: 0.25
Nodes (5): Repo layout, CLAUDE.md project harness, Working loop (orient, plan, skill, change, run, document, commit), Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...), Relief Stream skills index

### Community 19 - "phase2-modules.test.ts"
Cohesion: 0.19
Nodes (20): ClaimDoc, claimDocument(), clearIndices(), countVouchers(), roundForIndex(), upsertClaimDoc(), VOUCH_STATUSES, vouchQuery() (+12 more)

### Community 20 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.1, @prisma/engines@7.10.1, protobufjs

### Community 23 - "disasters/index.ts"
Cohesion: 0.06
Nodes (51): APIs (checked 2026-11-07), Caching, disaster-feeds, Env vars, Files it owns, Gotchas, Purpose, Test (+43 more)

### Community 24 - "checks.ts"
Cohesion: 0.11
Nodes (29): disasterContext(), nearDuplicateRule(), clipEnabled(), ExifInfo, readExif(), dHash(), hamming(), checkLocationStep() (+21 more)

### Community 25 - "setup.mjs"
Cohesion: 0.11
Nodes (18): child, env, composeUp(), dockerOk(), localServices(), readEnv(), run(), tcpOpen() (+10 more)

### Community 26 - "alerts/index.ts"
Cohesion: 0.28
Nodes (8): AlertResult, OpsAlertInput, OpsKind, opsPayload(), post(), ReviewAlertInput, reviewPayload(), sendReviewAlert()

### Community 27 - "send-payout.ts"
Cohesion: 0.13
Nodes (31): dynamic, GET(), runtime, hourKey(), sendOpsAlert(), cents(), FAILED_PAYOUT_STATUSES, lockPool() (+23 more)

### Community 28 - "trail/index.ts"
Cohesion: 0.06
Nodes (52): day(), dynamic, hhmm(), metadata, money(), ReceiptPage(), Record(), Env vars (+44 more)

### Community 29 - "speech/index.ts"
Cohesion: 0.18
Nodes (17): budgetExhaustedMessage(), BudgetGuard, BudgetProvider, dailyBudget(), dbBudget, DEFAULT_BUDGET, usageToday(), utcDay() (+9 more)

### Community 30 - "services"
Cohesion: 0.12
Nodes (17): envVarGroups, envVars, name, fromGroup, key, sync, value, services (+9 more)

### Community 31 - "elasticsearch"
Cohesion: 0.09
Nodes (24): environment, healthcheck, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+16 more)

### Community 32 - "kernel.ts"
Cohesion: 0.29
Nodes (10): corroborateAlert(), extractHazards(), inUsBox(), KERNEL_TIMEOUT_MS, KernelCheck, kernelEnabled(), MATCHERS, matchHazards() (+2 more)

### Community 33 - "render-workflows"
Cohesion: 0.18
Nodes (10): Blueprint (`render.yaml`, spec checked 2026-11-07), Cost (decision 2026-11-07: free tiers only → the deploy runs inline, workflow service commented out in render.yaml), Env vars, Files it owns, Gotchas, Idempotency, Purpose, render-workflows (+2 more)

### Community 34 - "kernel-browser"
Cohesion: 0.20
Nodes (9): API (kernel.sh docs + the SDK's .d.ts, checked 2026-11-07), Env vars, Files it owns, Gotchas, kernel-browser, Limits, Page and extraction, Purpose (+1 more)

### Community 35 - "clip.ts"
Cohesion: 0.14
Nodes (15): CLIP_DUPLICATE_THRESHOLD, CLIP_DIMS, CLIP_DTYPES, clipDtype(), clipModelId(), cosine(), CROP_VARIANTS, embedCrops() (+7 more)

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
Cohesion: 0.25
Nodes (7): elastic-search, Env vars, Files it owns, Gotchas, How to, Purpose, Test

### Community 41 - "How to record (phone or laptop, 10–20 seconds each)"
Cohesion: 0.33
Nodes (5): fake-contradictory-voice (already here), genuine-1-en (English, about 15 s), genuine-3-hi (Hindi, about 15 s), How to record (phone or laptop, 10–20 seconds each), Voice-note fixtures

### Community 42 - "20261106233323_init/migration.sql"
Cohesion: 0.13
Nodes (23): "allocation", allocation_donation_id_payout_id_key, "claim", claim_claim_public_id_key, claim_paypal_email_idx, claim_photo_sha256_idx, claim_status_idx, "decision" (+15 more)

### Community 43 - "env"
Cohesion: 0.14
Nodes (25): Fields, maxDuration, PHOTO_TYPES, POST(), runtime, Body, runtime, Body (+17 more)

### Community 44 - "orders.ts"
Cohesion: 0.19
Nodes (16): POST(), Body, runtime, paypalFetch(), CapturedDonation, captureOrder(), CaptureSchema, createDonationOrder() (+8 more)

### Community 45 - "ag-grid-dashboard"
Cohesion: 0.25
Nodes (7): AG Grid Community 36 (MIT, free), ag-grid-dashboard, Files it owns, Layout, Privacy (privacy-guard), Purpose, Test

### Community 46 - "newman.d.ts"
Cohesion: 0.40
Nodes (4): newman, NewmanRunOptions, NewmanRunSummary, Stat

### Community 47 - "privacy/index.ts"
Cohesion: 0.15
Nodes (18): Files it owns, postman-collection, Rules, Run, claimPublicId(), donorPublicId(), GEO_CELL_DEG, geoCell() (+10 more)

### Community 48 - "paypal/route.ts"
Cohesion: 0.25
Nodes (12): POST(), runtime, recordDonation(), getOrder(), getPayoutBatch(), summarizeBatch(), HANDLED_EVENTS, payoutItemFromResource() (+4 more)

### Community 49 - "verify-claim.ts"
Cohesion: 0.14
Nodes (17): dropEvidence(), Evidence, getEvidence(), keepLocal(), local, CheckResults, AiSummary, beginVerification() (+9 more)

### Community 50 - "photos-pg.ts"
Cohesion: 0.26
Nodes (9): bestMatches(), decodeVec(), encodeVec(), nearestPhotosPg(), PG_MAX_PHOTOS, StoredCrop, storePhotoVariantsPg(), normalise() (+1 more)

### Community 51 - "contract.ts"
Cohesion: 0.26
Nodes (10): AI_ASSESSMENT_JSON_SCHEMA, AiAssessment, AiErrorClass, AiErrorKind, classifyAiError(), describeAiError(), MAX_INLINE_RETRY_MS, parseAssessment() (+2 more)

### Community 52 - "dotenv"
Cohesion: 0.40
Nodes (4): dotenv@^18.0.9, prisma@7.10.1, dotenv, prisma

### Community 53 - "ai/index.ts"
Cohesion: 0.24
Nodes (11): AiCalls, ASSESS_SYSTEM_PROMPT, assessClaim(), AssessOptions, AssessResult, Attempt, buildAssessPrompt(), defaultProviders() (+3 more)

### Community 54 - "providers.ts"
Cohesion: 0.20
Nodes (11): buildGroqBody(), callGroq(), GEMINI_TIMEOUT_MS, GROQ_CHAT_URL, GROQ_MAX_REQUEST_BYTES, groqErrorText(), ProviderCall, ProviderName (+3 more)

### Community 55 - "admin/page.tsx"
Cohesion: 0.31
Nodes (9): AdminPage(), COLORS, dynamic, Provider(), Stat(), Status(), Table(), time() (+1 more)

### Community 56 - "playwright-core"
Cohesion: 0.40
Nodes (4): playwright-core@^1.65.0, playwright-core, launch(), main()

### Community 57 - "20261107174034_trail_queue/migration.sql"
Cohesion: 0.83
Nodes (3): "trail_entry", trail_entry_kind_ref_id_key, trail_entry_status_next_attempt_at_idx

## Knowledge Gaps
- **11 isolated node(s):** `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)`, `Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...)`, `scoringConfigFrom env validation` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 428 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `json` be split into smaller, more focused modules?**
  _Cohesion score 0.1443850267379679 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `env` to `json`, `payouts.ts`, `db.ts`, `package.json`, `orders.ts`, `paypal/route.ts`, `dependencies`, `contract.ts`, `disasters/index.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `scoring/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07397959183673469 - nodes in this community are weakly interconnected._
- **Why does `db` connect `db.ts` to `json`, `ai-fallback.test.ts`, `env`, `Dashboard.tsx`, `paypal/route.ts`, `verify-claim.ts`, `disasters/index.ts`, `admin/page.tsx`, `checks.ts`, `alerts/index.ts`, `send-payout.ts`, `trail/index.ts`, `speech/index.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `payouts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11255411255411256 - nodes in this community are weakly interconnected._