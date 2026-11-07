# CLAUDE.md — Relief Stream

This file is the harness for every prompt in this repo. Follow it on every task.

## Project in one paragraph

**Relief Stream** is our entry for the PayPal "Build What's Next with PayPal and AI" hackathon (deadline **Nov 12, 2026, 3:00 PM EST**). Charity-stream donations go into one PayPal sandbox relief pool. AI agents verify people in a disaster zone (location, photo, message, uniqueness, community vouching). Verified people are paid directly with PayPal Payouts, with no NGO or middleman. Every donation, decision and payout is recorded on a public Solana devnet trail with test PYUSD, using anonymous IDs. Donors get a receipt showing exactly where their money went.

## Always read first

@harness.md
@architecture.md
@SKILL.md

- `harness.md`: goals, rules, companies, build plan, demo script.
- `architecture.md`: system design (Mermaid), data model, scoring, API surface, repo layout. Update it whenever the design changes.
- `SKILL.md`: which project skill to load from `.claude/skills/`. If those skills do not exist yet, create them first as `SKILL.md` instructs.

## Token discipline (Graphify)

- If `graphify-out/GRAPH_REPORT.md` exists, read it and query `graphify-out/graph.json` **before** using Glob/Grep or opening files.
- If it does not exist and the repo has code, set it up: `pip install graphifyy && graphify install && graphify claude install`, then run `/graphify .`.
- After large changes, refresh the graph (`graphify update .` or `/graphify .`).
- Open only the files the task needs. Don't re-read files you just edited.

## Hard rules

1. **Money decisions are code, not AI.** Gemini returns signal scores and an explanation; `lib/scoring` decides and sizes payouts. Agents never call Payouts.
2. Thresholds: ≥ 75 auto-pay, 50–74 human review, < 50 reject. Duplicate = reject. Packet ≤ `MAX_FIRST_PACKET_USD` and ≤ pool balance.
3. **No middlemen:** reviewers approve/reject only; every decision goes on the trail.
4. **Privacy:** nothing personal on-chain or on the public dashboard. Use `lib/privacy`.
5. **Sandbox and devnet only.** Never live keys, never mainnet.
6. **Secrets** only from `.env`; never log, print or commit them. Update `.env.example` (keys only) when adding a variable.
7. All external services go through wrappers in `lib/` (paypal, ai, speech, vision, search, disasters, trail, alerts).
8. Idempotent payouts (`sender_batch_id`) and de-duplicated webhooks.
9. Don't guess PayPal field names. Use the APIMatic Context Plugin or official docs.
10. Don't add sponsors or frameworks outside `harness.md` §4 and `architecture.md` §9 without asking.

## Commands

```bash
npm install            # also runs prisma generate
npm run check:env      # SET/MISSING + live PayPal/Gemini/Postgres checks (never prints values)
npm run dev            # Next.js on :3000
npm test               # vitest
npm run typecheck      # tsc --noEmit
npx prisma migrate dev # or npm run db:migrate
npm run paypal:smoke   # $1 sandbox order + pool payee check
npm run sim:stream     # scripted donations (needs sandbox card processing enabled)
npm run sim:claims     # scripted claims incl. planted fakes (-- --placeholder for example.com emails)
npm run sim:reset -- --yes
npm run sim:demo -- --runs 3   # full loop with checks
```

## Working loop

1. Orient with the graph → 2. find the task in `architecture.md` / `harness.md` §8 → 3. load the skill → 4. make one small change with a test or Postman request → 5. run it → 6. update docs and tick the checklist → 7. commit.

Say what you verified and how. If something wasn't run, say so.

## Style

- TypeScript strict, zod at every boundary, small pure functions in `lib/scoring`.
- Clear commit messages: `feat(payouts): ...`, `fix(webhooks): ...`.
- UI: clean and readable; the dashboard must make "where did the money go" obvious in 5 seconds.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
