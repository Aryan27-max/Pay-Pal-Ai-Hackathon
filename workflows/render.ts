import "../scripts/load-env";
/**
 * Render Workflows entry point (workflow service start command: `npx tsx workflows/render.ts`).
 * Registering the tasks is enough: the SDK starts the task server when RENDER_SDK_SOCKET_PATH is set
 * (Render does this). Locally: `render workflows dev -- npx tsx workflows/render.ts`.
 *
 * verify_claim runs the five checks as parallel child tasks (Promise.all over ctx.run), then the
 * deterministic decision in-process, then chains send_payout for an APPROVED claim.
 * Retries: checks back off 2 s ×2; payout calls are idempotent (sender_batch_id + advisory lock).
 * See .claude/skills/render-workflows/SKILL.md.
 */
import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { checkLocationStep, checkMessageStep, checkPhotoStep, checkUniquenessStep, checkVouchingStep } from "./checks";
import { retryWaitingFunds, sendPayout } from "./send-payout";
import { beginVerification, finalizeClaim, runChecks, storedResult } from "./verify-claim";

const checkRetry = { maxRetries: 2, waitDurationMs: 2_000, backoffScaling: 2 };

const checkLocation = task({ name: "check_location", retry: checkRetry, timeoutSeconds: 120 }, async (_ctx: TaskContext, claimId: string) => checkLocationStep(claimId));
const checkPhoto = task({ name: "check_photo", retry: checkRetry, timeoutSeconds: 300 }, async (_ctx: TaskContext, claimId: string) => checkPhotoStep(claimId));
const checkMessage = task({ name: "check_message", retry: checkRetry, timeoutSeconds: 120 }, async (_ctx: TaskContext, claimId: string) => checkMessageStep(claimId));
const checkUniqueness = task({ name: "check_uniqueness", retry: checkRetry, timeoutSeconds: 60 }, async (_ctx: TaskContext, claimId: string) => checkUniquenessStep(claimId));
const checkVouching = task({ name: "check_vouching", retry: checkRetry, timeoutSeconds: 60 }, async (_ctx: TaskContext, claimId: string) => checkVouchingStep(claimId));

const sendPayoutTask = task(
  { name: "send_payout", retry: { maxRetries: 3, waitDurationMs: 5_000, backoffScaling: 2 }, timeoutSeconds: 300 },
  async (_ctx: TaskContext, claimId: string) => {
    const r = await sendPayout(claimId);
    // Return only ids and statuses (run results are retained by Render): never the recipient email.
    return r.kind === "SENT" ? { kind: r.kind, senderBatchId: r.senderBatchId, payoutBatchId: r.payoutBatchId, itemStatus: r.result.itemStatus } : r;
  },
);

task({ name: "verify_claim", retry: { maxRetries: 2, waitDurationMs: 5_000, backoffScaling: 2 }, timeoutSeconds: 900 }, async (ctx: TaskContext, claimId: string) => {
  if (!(await beginVerification(claimId))) return { claimId, alreadyDecided: true, outcome: (await storedResult(claimId)).decision.outcome };
  const checks = await runChecks(claimId, {
    location: (id) => ctx.run(checkLocation, id),
    photo: (id) => ctx.run(checkPhoto, id),
    message: (id) => ctx.run(checkMessage, id),
    uniqueness: (id) => ctx.run(checkUniqueness, id),
    vouching: (id) => ctx.run(checkVouching, id),
  });
  const r = await finalizeClaim(claimId, checks);
  const payout = r.decision.outcome === "APPROVED" && !r.alreadyDecided ? await ctx.run(sendPayoutTask, claimId) : null;
  return { claimId, claimPublicId: r.claimPublicId, outcome: r.decision.outcome, score: r.decision.score, payout };
});

task({ name: "release_waiting_funds", retry: { maxRetries: 2, waitDurationMs: 5_000 }, timeoutSeconds: 600 }, async (_ctx: TaskContext) => {
  const released = await retryWaitingFunds();
  return released.map((r) => ({ claimPublicId: r.claimPublicId, kind: r.result.kind }));
});
