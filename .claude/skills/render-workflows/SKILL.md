---
name: render-workflows
description: Use for background steps and deploys — Render Workflows tasks (verify_claim with parallel checks, send_payout, release_waiting_funds), triggering them from API routes, local dev, the inline fallback and the render.yaml Blueprint.
---

# render-workflows

## Purpose

Verification and payouts run as durable, retryable Render Workflows tasks. The **logic** stays in
`workflows/*.ts` (plain functions); `workflows/render.ts` only registers them as tasks. With
`RENDER_WORKFLOW_SERVICE_ID` empty the API routes call the same functions inline (local dev, tests).

## Files it owns

- `workflows/render.ts` — task registrations (the workflow service's entry point)
- `workflows/dispatch.ts` — `startVerify(claimId)`, `startPayout(claimId)`, `startRelease()`: Workflows or inline
- `workflows/verify-claim.ts`, `workflows/send-payout.ts` — logic (unchanged by the move)
- `render.yaml` — web service + workflow service + Postgres

## Env vars

`RENDER_API_KEY` (SDK default), `RENDER_WORKFLOW_SERVICE_ID` (empty = inline), `RENDER_WORKFLOW_SLUG`
(task slug prefix, e.g. `relief-stream-workflows`), `RENDER_TASKS_URL` (local task server only).

## SDK (`@renderinc/sdk` 1.8, README + render.com/docs/workflows-*, checked 2026-11-07)

```ts
import { task, type TaskContext } from "@renderinc/sdk/workflows";
const checkPhoto = task({ name: "check_photo", retry: { maxRetries: 2, waitDurationMs: 2000, backoffScaling: 2 }, timeoutSeconds: 120 },
  async (ctx: TaskContext, claimId: string) => photoCheck(claimId));
task({ name: "verify_claim", timeoutSeconds: 600 }, async (ctx: TaskContext, claimId: string) => {
  const [photo, loc, msg, uniq, vouch] = await Promise.all([ctx.run(checkPhoto, claimId), /* … */]);
  return decideAndStore(claimId, { photo, loc, msg, uniq, vouch });
});
```
- Task args/returns must be JSON (≤ 4 MB). We pass **claim ids only**; evidence stays in Postgres.
- The task server auto-starts on Render (`RENDER_SDK_SOCKET_PATH` set); importing the file is enough.
- Trigger from Next.js: `new Render().workflows.startTask("<workflow-slug>/verify_claim", [claimId], { idempotencyKey: "verify-" + claimId })`.
  `startTask` returns `{ taskRunId, get() }`; `runTask` waits. Failed runs return a status, not a throw.
- Local: `render workflows dev -- npx tsx workflows/render.ts` (Render CLI ≥ 2.35, port 8120) and set
  `RENDER_TASKS_URL=http://localhost:8120` for the client.

## Idempotency

- `verify_claim` refuses claims not in `RECEIVED`/`VERIFYING` (a retry after the decision is a no-op).
- `send_payout` uses `sender_batch_id` (paypal-payouts) + the advisory lock; Render's `idempotencyKey`
  prevents double starts for 24 h.
- Sub-checks are pure reads + idempotent upserts (Elastic docs keyed by `claim_public_id`).

## Blueprint (`render.yaml`, spec checked 2026-11-07)

- `type: web`, `runtime: node`, `plan: free`, `region: singapore`, build `npm ci --include=dev && npx prisma migrate deploy && npm run clip:prefetch && npm run build`
  (`--include=dev` because NODE_ENV=production would skip the build tooling), start `npm start`, health check `/api/pool`.
- `type: workflow`, `runtime: node`, **`region` required**, no `plan` (per-task plans in code). Kept commented out (paid).
- We reuse the EXISTING Render Postgres (Singapore) instead of a `databases:` block: paste its internal URL as
  `DATABASE_URL`. Secrets are `sync: false` in an `envVarGroups` group (prompted once on first Blueprint creation).
- Region must match the database (singapore) so traffic stays on the private network.

## Cost (decision 2026-11-07: free tiers only → the deploy runs inline, workflow service commented out in render.yaml)

Workflows has **no free tier** in Render's docs: per-second billing on the task's plan (`flex` default,
$0.20/CPU-hour + $0.05/GB-hour, billed on actual use). One verification ≈ a few CPU-seconds.
Root runs: 50/min on Hobby (429 when exceeded).

## Gotchas

- `Promise.all` over `ctx.run` is the parallel form; without it chained runs execute serially.
- Flows are a different API (`flow`, `ctx.step`); we use tasks only.
- All tasks in a chain must belong to the same workflow service.

## Test

- Task registration smoke test: load `workflows/render.ts` with `RENDER_SDK_AUTO_START=false` and list
  `TaskRegistry.getInstance().getAllTaskNames()` (8 tasks). Local task server needs the Render CLI (not installed).
- Deployed: `SIM_BASE_URL=<render-url> npm run sim:demo` (the simulator also reads Postgres directly, so the
  deploy must use the same database).
