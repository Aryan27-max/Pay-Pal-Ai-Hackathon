# Graph Report - relief-stream  (2026-11-07)

## Corpus Check
- 73 files · ~33,104 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 529 nodes · 1155 edges · 23 communities (20 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- http.ts
- Gemini AI Assessment
- send-payout.ts
- Demo Simulators
- Dev Dependencies
- Scoring Engine Concepts
- ai/index.ts
- Privacy Guard Rules
- Reviewer & Stream Pages
- TypeScript Config
- Env Checker Script
- Hackathon Plan & Fixtures
- NPM Scripts
- PayPal Sandbox Integration
- layout.tsx
- Gemini Contract Concepts
- Runtime Dependencies
- Payout Flow & Pool Guard
- Project Harness Rules
- Prisma Config
- Install Script Allowlist
- Vitest Config

## God Nodes (most connected - your core abstractions)
1. `json()` - 23 edges
2. `errorResponse()` - 22 edges
3. `env()` - 18 edges
4. `verifyClaim()` - 18 edges
5. `architecture.md system design` - 18 edges
6. `compilerOptions` - 17 edges
7. `sendPayout()` - 16 edges
8. `scripts` - 16 edges
9. `harness.md operating manual` - 16 edges
10. `zod` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Pool-balance guard (remaining minus in-flight payouts)` --semantically_similar_to--> `Pool balance definition`  [INFERRED] [semantically similar]
  .claude/skills/paypal-payouts/SKILL.md → architecture.md
- `AI tools used (Gemini, Claude Code, APIMatic planned)` --references--> `assessClaim() Gemini call`  [INFERRED]
  README.md → .claude/skills/gemini-ai/SKILL.md
- `lib/ledger recordDonation upsert` --shares_data_with--> `DONATION entity`  [INFERRED]
  .claude/skills/paypal-sandbox/SKILL.md → architecture.md
- `sender_batch_id = claim_public_id-attempt` --shares_data_with--> `PAYOUT entity`  [INFERRED]
  .claude/skills/paypal-payouts/SKILL.md → architecture.md
- `gemini-ai skill` --implements--> `External calls through lib/ wrappers`  [INFERRED]
  .claude/skills/gemini-ai/SKILL.md → harness.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Privacy controls for public surfaces** — harness_privacy_rule, _claude_skills_privacy_guard_skill_claimpublicid, _claude_skills_privacy_guard_skill_geocell, _claude_skills_privacy_guard_skill_redactclaim, _claude_skills_gemini_ai_skill_pii_minimization, architecture_solana_trail [INFERRED 0.85]
- **Deterministic money pipeline (score -> decide -> size -> pay -> FIFO settle)** — harness_deterministic_money_logic, _claude_skills_claim_verification_skill_decide, _claude_skills_claim_verification_skill_packetfor, _claude_skills_paypal_payouts_skill_sendpayout, _claude_skills_paypal_payouts_skill_settlepayout, _claude_skills_claim_verification_skill_planfifoallocation [INFERRED 0.95]
- **Idempotency mechanisms across PayPal calls** — harness_idempotency_rule, _claude_skills_paypal_sandbox_skill_paypal_request_id, _claude_skills_paypal_payouts_skill_sender_batch_id, _claude_skills_paypal_sandbox_skill_webhook_dedup, _claude_skills_paypal_sandbox_skill_recorddonation [INFERRED 0.95]

## Communities (23 total, 3 thin omitted)

### Community 0 - "http.ts"
Cohesion: 0.06
Nodes (59): dynamic, GET(), runtime, Fields, maxDuration, PHOTO_TYPES, POST(), runtime (+51 more)

### Community 1 - "Gemini AI Assessment"
Cohesion: 0.11
Nodes (31): checkLocation(), DEMO_ZONE, disasterContext(), DisasterZone, LocationCheck, ZoneSchema, haversineKm(), AllocationPlan (+23 more)

### Community 2 - "send-payout.ts"
Cohesion: 0.05
Nodes (70): AdminPage(), COLORS, dynamic, Provider(), Stat(), Status(), Table(), time() (+62 more)

### Community 3 - "Demo Simulators"
Cohesion: 0.13
Nodes (27): ClaimRun, runClaims(), aiCallsByRun, arg(), IN_FLIGHT, main(), oneRun(), settleAll() (+19 more)

### Community 4 - "Dev Dependencies"
Cohesion: 0.10
Nodes (27): devDependencies, eslint@^9.39.5, eslint-config-next@^16.4.5, postcss@^8.5.32, tailwindcss@^4.3.5, @tailwindcss/postcss@^4.3.5, tsx@^4.23.15, @types/node@^26.6.6 (+19 more)

### Community 5 - "Scoring Engine Concepts"
Cohesion: 0.12
Nodes (17): claim-verification skill, planFifoAllocation, scoringConfigFrom env validation, totalScore (weighted signal sum), VERIFIED_CLAIM_STATUSES (vouching), flood-zone.json demo zone, Next.js agent rules (read bundled docs, breaking changes), API surface (Next.js route handlers) (+9 more)

### Community 6 - "ai/index.ts"
Cohesion: 0.08
Nodes (45): AI_ASSESSMENT_JSON_SCHEMA, AiAssessment, AiAssessmentSchema, AiErrorClass, AiErrorKind, classifyAiError(), describeAiError(), MAX_INLINE_RETRY_MS (+37 more)

### Community 7 - "Privacy Guard Rules"
Cohesion: 0.16
Nodes (17): CLAIM_ID_SALT, claimPublicId HMAC (c_ + 20 hex), donorPublicId HMAC (d_ + 20 hex), geoCell 0.1 degree grid (~10 km), privacy-guard skill, Private claim fields (email, lat, lon, message, photo), redactClaim, Privacy review checklist (+9 more)

### Community 8 - "Reviewer & Stream Pages"
Cohesion: 0.11
Nodes (15): ReviewClaim, ReviewPage(), dynamic, StreamPage(), AMOUNTS, ChatLine, FAKE_CHAT, Pool (+7 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Env Checker Script"
Cohesion: 0.18
Nodes (17): bad(), checkDatabase(), checkGemini(), checkGroq(), checkPayPal(), dim(), emailList(), Env (+9 more)

### Community 11 - "Hackathon Plan & Fixtures"
Cohesion: 0.20
Nodes (15): Claim fixtures (3 genuine, 2 borderline, 2 fakes), demo-simulators skill, fake-reused-photo fixture, sim:demo repeatable demo run, Build plan Nov 7-12, Definition of done, Demo script (<= 2:50), Goals in priority order (+7 more)

### Community 12 - "NPM Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, check:env, db:generate, db:migrate, dev, paypal:smoke, postinstall (+8 more)

### Community 13 - "PayPal Sandbox Integration"
Cohesion: 0.20
Nodes (11): Scripted sandbox test-card donations, PayPal JS SDK donate button, OAuth client-credentials token cache, Orders v2 create / capture, PayPal-Request-Id idempotency header, paypal-sandbox skill, paypal:smoke pool payee check, lib/ledger recordDonation upsert (+3 more)

### Community 15 - "Gemini Contract Concepts"
Cohesion: 0.24
Nodes (7): Five signal builders (photo, location, message, uniqueness, vouching), fake-duplicate-account fixture, AiAssessmentSchema zod contract / parseAssessment, assessClaim() Gemini call, gemini-ai skill, sanitizeError (strip API key), Gemini output contract

### Community 16 - "Runtime Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, @google/genai@^3.0.0, next@^16.4.5, pg@^8.23.1, @prisma/adapter-pg@7.10.1, @prisma/client@7.10.1, react-dom@^19.3.1, zod@^4.6.7 (+5 more)

### Community 17 - "Payout Flow & Pool Guard"
Cohesion: 0.36
Nodes (9): packetFor packet sizing, pg_advisory_xact_lock pool reservation, Payout batch polling (3 s, 60 s), PayPal Payouts v1 API (POST /v1/payments/payouts), paypal-payouts skill, Pool-balance guard (remaining minus in-flight payouts), sendPayout(claimId) flow, settlePayout (idempotent FIFO settlement) (+1 more)

### Community 18 - "Project Harness Rules"
Cohesion: 0.25
Nodes (5): Repo layout, CLAUDE.md project harness, Working loop (orient, plan, skill, change, run, document, commit), Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...), Relief Stream skills index

### Community 19 - "Prisma Config"
Cohesion: 0.40
Nodes (4): dotenv@^18.0.9, prisma@7.10.1, dotenv, prisma

### Community 20 - "Install Script Allowlist"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.1, @prisma/engines@7.10.1, protobufjs

## Knowledge Gaps
- **11 isolated node(s):** `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)`, `Unbuilt skills (agent-toolkit, whisper, elastic, solana, zapier, AG Grid, ...)`, `scoringConfigFrom env validation` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 179 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `http.ts` to `Gemini AI Assessment`, `send-payout.ts`, `Demo Simulators`, `Dev Dependencies`, `ai/index.ts`, `Runtime Dependencies`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **What connects `OAuth client-credentials token cache`, `paypal:smoke pool payee check`, `sanitizeError (strip API key)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `http.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05935938877461064 - nodes in this community are weakly interconnected._
- **Why does `next` connect `http.ts` to `Runtime Dependencies`, `send-payout.ts`, `Dev Dependencies`, `layout.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `Gemini AI Assessment` be split into smaller, more focused modules?**
  _Cohesion score 0.10668563300142248 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Vitest Config` to `http.ts`, `Gemini AI Assessment`, `send-payout.ts`, `Dev Dependencies`, `ai/index.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `send-payout.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054363796650014694 - nodes in this community are weakly interconnected._