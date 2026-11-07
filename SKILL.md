---
name: relief-stream-skills
description: Index and generator for every project skill Relief Stream needs. Use at project start to create the skills, and before any task to pick the right one.
---

# SKILL.md — Relief Stream skills

## Instructions for Claude (do this first)

This file lists the skills the project needs. **Your job is to create each one** as a real Claude Code skill:

1. For each skill in the table below, create `.claude/skills/<skill-name>/SKILL.md`.
2. Each file starts with YAML frontmatter:
   ```yaml
   ---
   name: <skill-name>
   description: <one sentence: when to use this skill>
   ---
   ```
3. The body must contain: **purpose**, **files it owns** (from `architecture.md` §8), **env vars it uses** (from `.env.example`), **step-by-step how-to**, **exact API calls / code patterns**, **gotchas**, and **how to test it** (a vitest test and/or a Postman request).
4. Base every API detail on official docs or the APIMatic Context Plugin. **Do not invent endpoint paths or field names.** If something cannot be confirmed, write `TODO: confirm` in the skill.
5. Follow the rules in `harness.md` §5 (deterministic money logic, privacy, sandbox only, idempotency).
6. Keep each skill under ~150 lines. Link to `architecture.md` instead of repeating it.
7. When all skills exist, tick them below and commit: `chore: add project skills`.
8. Also install these third-party helpers if available: **Graphify** (`pip install graphifyy && graphify install && graphify claude install`), the **APIMatic Context Plugin for PayPal SDKs**, and **Render's workflows agent skill**.

## Skills to create

| ✓ | Skill name | Use it when | Must cover |
| --- | --- | --- | --- |
| [x] | `paypal-sandbox` | Any PayPal call | OAuth client-credentials token + caching; Orders v2 create/capture; JS SDK donate button; webhook signature verification (`/v1/notifications/verify-webhook-signature`); event types `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED/FAILED/UNCLAIMED`; sandbox account setup; idempotency (`PayPal-Request-Id`) |
| [x] | `paypal-payouts` | Sending relief packets | `POST /v1/payments/payouts`, `sender_batch_id` = claim_id + attempt, recipient_type EMAIL, batch/item status polling, pool-balance guard, failure + retry |
| [ ] | `paypal-agent-toolkit` | Giving agents PayPal tools | `@paypal/agent-toolkit` setup, which tools to expose (read-only for agents; payouts stay in engine), MCP sandbox server option |
| [x] | `claim-verification` | Scoring logic | The five signals, weights, hard rules, thresholds, packet caps from `architecture.md` §5; pure functions; full unit tests incl. edge cases (exactly 50, exactly 75, duplicate with high score) |
| [x] | `gemini-ai` | Any LLM or vision call | Single `lib/ai` wrapper; model names from env; JSON output contract + zod validation; retry → `IN_REVIEW` on bad output; prompt templates for photo and message checks; free-tier rate limits; never send PII beyond what the check needs |
| [x] | `speech-whisper` | Voice notes | `lib/speech` with `local` (faster-whisper) and `groq` modes, language detection, 10-second minimum billing note |
| [x] | `photo-forensics` | Photo checks | EXIF read (exifr), timestamp/location plausibility, SHA-256 hash, CLIP embedding, AI-generated-image risk via Gemini |
| [x] | `elastic-search` | Duplicates and nearby claims | Index mappings (dense_vector for CLIP, geo_point), kNN duplicate threshold, geo_distance query for vouching, seeding script |
| [x] | `disaster-feeds` | Location check | GDACS + USGS parsing, point-in-area test, caching, Kernel fallback for official alert pages, demo fixtures for a simulated flood zone |
| [x] | `kernel-browser` | Pages with no API | `@onkernel/sdk` + Playwright session, extract alert status, live view link for the demo, timeouts |
| [x] | `render-workflows` | Background steps | `verify_claim`, `send_payout`, `write_trail` tasks; retries; triggering from API routes; local dev; `render.yaml` blueprint for web + Postgres + workflows |
| [ ] | `astropods-agent` | Deploying / monitoring agents | `astropods.yml`, Dockerfile, `ast dev`, deploy, where to view traces for the video |
| [ ] | `solana-trail` | Public record | Devnet connection, trail wallet from env, test PYUSD transfer + Memo format `RS\|v1\|<type>\|<id>\|<amount>\|<hash>`, explorer links, faucet steps, never PII |
| [x] | `privacy-guard` | Anything public | HMAC public IDs, ~10 km geo rounding, redaction before dashboard/chain, review checklist |
| [x] | `zapier-alerts` | Reviewer + ops alerts | Catch Hook payload shape, what each Zap does (Slack/email), test command |
| [ ] | `ag-grid-dashboard` | Public dashboard + reviewer queue | Columns, live refresh, explorer links, status colors, donor receipt view |
| [ ] | `postman-collection` | API testing | Collection structure (PayPal, internal, simulators), environments (local, render), tests per request, export path `postman/` |
| [x] | `demo-simulators` | Building the demo | Stream page with fake chat + sandbox donors; claim fixtures: 3 genuine, 2 borderline, 2 fakes (reused photo, duplicate PayPal account); one-click "run demo" |
| [ ] | `hackathon-submission` | Final day | README template (problem, how to run, AI tools used, sponsor tools used, sandbox logins), LICENSE, Devpost text, video checklist from `harness.md` §9 |

## Picking a skill

Before a task, match it to the table above and read that skill. If a task needs two (e.g. payouts + trail), read both. If no skill fits, follow `harness.md` §6 and consider adding a new row here.
