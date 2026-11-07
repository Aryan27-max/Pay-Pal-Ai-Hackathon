# Graph Report - relief-stream  (2026-11-07)

## Corpus Check
- 112 files · ~54,848 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 856 nodes · 1906 edges · 42 communities (39 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 72 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f33e7f53`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [claimId]/route.ts
- Gemini AI Assessment
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
- next
- Gemini Contract Concepts
- dependencies
- Payout Flow & Pool Guard
- Project Harness Rules
- phase2-modules.test.ts
- Install Script Allowlist
- Vitest Config
- disasters/index.ts
- checks.ts
- env
- db.ts
- send-payout.ts
- verify-claim.ts
- admin/page.tsx
- services
- orders.ts
- privacy/index.ts
- render-workflows
- kernel-browser
- photoSignal
- review/page.tsx
- speech-whisper
- zapier-alerts
- elastic-search
- How to record (phone or laptop, 10–20 seconds each)

## God Nodes (most connected - your core abstractions)
1. `env()` - 40 edges
2. `finalizeClaim()` - 25 edges
3. `db` - 24 edges
4. `json()` - 23 edges
5. `errorResponse()` - 22 edges
6. `scripts` - 21 edges
7. `sendPayout()` - 18 edges
8. `architecture.md system design` - 18 edges
9. `zod` - 17 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Files it owns` --references--> `ensureIndices()`  [INFERRED]
  .claude/skills/elastic-search/SKILL.md → lib/search/client.ts
- `Test` --references--> `locate()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts
- `Purpose` --references--> `DisasterEvent`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/types.ts
- `APIs (checked 2026-11-07)` --references--> `Polygon`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/types.ts
- `Files it owns` --references--> `pointInPolygon()`  [INFERRED]
  .claude/skills/disaster-feeds/SKILL.md → lib/disasters/geo.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Privacy controls for public surfaces** — harness_privacy_rule, _claude_skills_privacy_guard_skill_claimpublicid, _claude_skills_privacy_guard_skill_geocell, _claude_skills_privacy_guard_skill_redactclaim, _claude_skills_gemini_ai_skill_pii_minimization, architecture_solana_trail [INFERRED 0.85]
- **Deterministic money pipeline (score -> decide -> size -> pay -> FIFO settle)** — harness_deterministic_money_logic, _claude_skills_claim_verification_skill_decide, _claude_skills_claim_verification_skill_packetfor, _claude_skills_paypal_payouts_skill_sendpayout, _claude_skills_paypal_payouts_skill_settlepayout, _claude_skills_claim_verification_skill_planfifoallocation [INFERRED 0.95]
- **Idempotency mechanisms across PayPal calls** — harness_idempotency_rule, _claude_skills_paypal_sandbox_skill_paypal_request_id, _claude_skills_paypal_payouts_skill_sender_batch_id, _claude_skills_paypal_sandbox_skill_webhook_dedup, _claude_skills_paypal_sandbox_skill_recorddonation [INFERRED 0.95]

## Communities (42 total, 3 thin omitted)

### Community 0 - "[claimId]/route.ts"
Cohesion: 0.14
Nodes (29): GET(), Body, runtime, POST(), POST(), runtime, dynamic, GET() (+21 more)

### Community 1 - "Gemini AI Assessment"
Cohesion: 0.10
Nodes (27): AI_GENERATED_FLAG, AllocationPlan, clamp01(), CORE_EVIDENCE_FLOOR, decide(), DecideOptions, DonationBalance, EXIF_GPS_MAX_KM (+19 more)

### Community 2 - "paypal/route.ts"
Cohesion: 0.09
Nodes (29): POST(), runtime, getAccessToken(), issuesOf(), PayPalConfig, PayPalError, paypalFetch(), PayPalRequest (+21 more)

### Community 3 - "Demo Simulators"
Cohesion: 0.11
Nodes (37): caughtBy(), ClaimRun, Detail, DONE(), emailFor(), fx(), pollReport(), Report (+29 more)

### Community 4 - "Dev Dependencies"
Cohesion: 0.09
Nodes (29): devDependencies, eslint@^9.39.5, eslint-config-next@^16.4.5, postcss@^8.5.32, prisma@7.10.1, tailwindcss@^4.3.5, @tailwindcss/postcss@^4.3.5, tsx@^4.23.15 (+21 more)

### Community 5 - "Scoring Engine Concepts"
Cohesion: 0.12
Nodes (17): claim-verification skill, planFifoAllocation, scoringConfigFrom env validation, totalScore (weighted signal sum), VERIFIED_CLAIM_STATUSES (vouching), flood-zone.json demo zone, Next.js agent rules (read bundled docs, breaking changes), API surface (Next.js route handlers) (+9 more)

### Community 6 - "ai/index.ts"
Cohesion: 0.08
Nodes (46): AI_ASSESSMENT_JSON_SCHEMA, AiAssessment, AiAssessmentSchema, AiErrorClass, AiErrorKind, classifyAiError(), describeAiError(), MAX_INLINE_RETRY_MS (+38 more)

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
Cohesion: 0.08
Nodes (33): sha256Hex(), CLIP_DUPLICATE_THRESHOLD, clipModelId(), cosine(), embedImage(), load(), Loaded, normalise() (+25 more)

### Community 11 - "Hackathon Plan & Fixtures"
Cohesion: 0.20
Nodes (15): Claim fixtures (3 genuine, 2 borderline, 2 fakes), demo-simulators skill, fake-reused-photo fixture, sim:demo repeatable demo run, Build plan Nov 7-12, Definition of done, Demo script (<= 2:50), Goals in priority order (+7 more)

### Community 12 - "NPM Scripts"
Cohesion: 0.10
Nodes (21): scripts, alerts:test, build, check:env, clip:prefetch, clip:tune, db:generate, db:migrate (+13 more)

### Community 13 - "PayPal Sandbox Integration"
Cohesion: 0.20
Nodes (11): Scripted sandbox test-card donations, PayPal JS SDK donate button, OAuth client-credentials token cache, Orders v2 create / capture, PayPal-Request-Id idempotency header, paypal-sandbox skill, paypal:smoke pool payee check, lib/ledger recordDonation upsert (+3 more)

### Community 14 - "next"
Cohesion: 0.14
Nodes (6): metadata, CARDS, dynamic, nextConfig, next@^16.4.5, next

### Community 15 - "Gemini Contract Concepts"
Cohesion: 0.24
Nodes (7): Five signal builders (photo, location, message, uniqueness, vouching), fake-duplicate-account fixture, AiAssessmentSchema zod contract / parseAssessment, assessClaim() Gemini call, gemini-ai skill, sanitizeError (strip API key), Gemini output contract

### Community 16 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, @elastic/elasticsearch@^9.5.1, exifr@^7.1.3, @google/genai@^3.0.0, @huggingface/transformers@^4.3.2, @onkernel/sdk@^0.142.0, pg@^8.23.1, playwright-core@^1.65.0 (+16 more)

### Community 17 - "Payout Flow & Pool Guard"
Cohesion: 0.36
Nodes (9): packetFor packet sizing, pg_advisory_xact_lock pool reservation, Payout batch polling (3 s, 60 s), PayPal Payouts v1 API (POST /v1/payments/payouts), paypal-payouts skill, Pool-balance guard (remaining minus in-flight payouts), sendPayout(claimId) flow, settlePayout (idempotent FIFO settlement) (+1 more)

### Community 18 - "Project Harness Rules"
Cohesion: 0.25
Nodes (5): Repo layout, CLAUDE.md project harness, Working loop (orient, plan, skill, change, run, document, commit), Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...), Relief Stream skills index

### Community 19 - "phase2-modules.test.ts"
Cohesion: 0.10
Nodes (35): corroborateAlert(), extractHazards(), inUsBox(), KERNEL_TIMEOUT_MS, KernelCheck, kernelEnabled(), MATCHERS, matchHazards() (+27 more)

### Community 20 - "Install Script Allowlist"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.1, @prisma/engines@7.10.1, protobufjs

### Community 23 - "disasters/index.ts"
Cohesion: 0.08
Nodes (37): DisasterContext, cached(), activeGdacs(), Collection, DEFAULT_RADIUS_KM, EVENT_ACTIVE_DAYS, Feature, gdacsEvents() (+29 more)

### Community 24 - "checks.ts"
Cohesion: 0.11
Nodes (32): Files it owns, getEvidence(), locate(), activeEvents(), checkLocation(), disasterContext(), areaLocationSignal(), elasticConfigured() (+24 more)

### Community 25 - "env"
Cohesion: 0.13
Nodes (26): Fields, maxDuration, PHOTO_TYPES, POST(), runtime, POST(), env(), AUDIO_TYPES (+18 more)

### Community 26 - "db.ts"
Cohesion: 0.12
Nodes (17): dynamic, runtime, AlertResult, OpsAlertInput, OpsKind, opsPayload(), post(), ReviewAlertInput (+9 more)

### Community 27 - "send-payout.ts"
Cohesion: 0.17
Nodes (24): hourKey(), cents(), FAILED_PAYOUT_STATUSES, lockPool(), poolBalanceCents(), recordDonation(), RESERVED_PAYOUT_STATUSES, settlePayout() (+16 more)

### Community 28 - "verify-claim.ts"
Cohesion: 0.14
Nodes (19): dropEvidence(), Evidence, keepLocal(), local, Decision, duplicateReason(), vouchingSignal(), AiSummary (+11 more)

### Community 29 - "admin/page.tsx"
Cohesion: 0.15
Nodes (17): AdminPage(), COLORS, dynamic, Provider(), Stat(), Status(), Table(), time() (+9 more)

### Community 30 - "services"
Cohesion: 0.12
Nodes (17): envVarGroups, envVars, name, fromGroup, key, sync, value, services (+9 more)

### Community 31 - "orders.ts"
Cohesion: 0.20
Nodes (14): Body, runtime, CapturedDonation, captureOrder(), CaptureSchema, createDonationOrder(), createSandboxCardDonation(), DonationAmountSchema (+6 more)

### Community 32 - "privacy/index.ts"
Cohesion: 0.26
Nodes (13): claimPublicId(), donorPublicId(), GEO_CELL_DEG, geoCell(), hmacHex(), maskEmail(), normEmail(), PublicClaim (+5 more)

### Community 33 - "render-workflows"
Cohesion: 0.18
Nodes (10): Blueprint (`render.yaml`, spec checked 2026-11-07), Cost (decision 2026-11-07: free tiers only → the deploy runs inline, workflow service commented out in render.yaml), Env vars, Files it owns, Gotchas, Idempotency, Purpose, render-workflows (+2 more)

### Community 34 - "kernel-browser"
Cohesion: 0.20
Nodes (9): API (kernel.sh docs + the SDK's .d.ts, checked 2026-11-07), Env vars, Files it owns, Gotchas, kernel-browser, Limits, Page and extraction, Purpose (+1 more)

### Community 35 - "photoSignal"
Cohesion: 0.29
Nodes (9): Env vars, Files it owns, Gotchas, How to, photo-forensics, Purpose, Test, exifFactor() (+1 more)

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

## Knowledge Gaps
- **11 isolated node(s):** `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)`, `Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...)`, `scoringConfigFrom env validation` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 319 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `[claimId]/route.ts` to `paypal/route.ts`, `Demo Simulators`, `Dev Dependencies`, `ai/index.ts`, `dependencies`, `disasters/index.ts`, `env`, `orders.ts`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **What connects `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `[claimId]/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13813813813813813 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Vitest Config` to `privacy/index.ts`, `Gemini AI Assessment`, `paypal/route.ts`, `Dev Dependencies`, `ai/index.ts`, `phase2-modules.test.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `Gemini AI Assessment` be split into smaller, more focused modules?**
  _Cohesion score 0.10080645161290322 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `NPM Scripts` to `Dev Dependencies`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `paypal/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0915915915915916 - nodes in this community are weakly interconnected._