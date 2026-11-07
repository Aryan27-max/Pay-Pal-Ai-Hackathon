import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Public Solana devnet trail (see .claude/skills/solana-trail/SKILL.md).
 * Every donation, every decision (engine and reviewer) and every successful payout gets ONE trail entry:
 *   memo = RS|v1|<type>|<public_id>|<amount_usd>|<sha256 of the public row JSON>
 * The row JSON holds public fields only (public ids, amounts, PayPal ids, timestamps; a reviewer's free-text
 * reason is included only as its sha256). It is published on /api/trail so anyone can re-hash it and compare
 * with the memo on the explorer. Entries are queued inside the same DB transaction as the event and sent by
 * the background worker (lib/trail/worker.ts): a chain problem never blocks or duplicates a PayPal action.
 */
export type TrailKind = "donation" | "decision" | "payout";
type Db = Prisma.TransactionClient | typeof db;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Deterministic JSON: keys sorted, so the hash is reproducible from /api/trail. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export const rowHash = (row: Record<string, unknown>) => sha256(canonicalJson(row));

/** Pure (tested). Solana memos are limited (~566 bytes); ours is ~110. */
export function buildMemo(type: string, publicId: string, amountUsd: string, sha: string): string {
  if (/[|\n]/.test(type + publicId + amountUsd)) throw new Error("memo fields must not contain | or newlines");
  return `RS|v1|${type}|${publicId}|${amountUsd}|${sha}`;
}

const usd = (d: Prisma.Decimal | number | string) => Number(d).toFixed(2);

async function enqueue(tx: Db, kind: TrailKind, refId: string, type: string, publicId: string, amountUsd: string, row: Record<string, unknown>) {
  const sha = rowHash(row);
  await tx.trailEntry.upsert({
    where: { kind_refId: { kind, refId } },
    create: { kind, refId, type, publicId, amountUsd, rowJson: row as Prisma.InputJsonValue, rowSha256: sha, memo: buildMemo(type, publicId, amountUsd, sha) },
    update: {}, // idempotent: the first entry for an event wins
  });
  kick();
}

export async function enqueueDonation(tx: Db, d: { id: string; donorPublicId: string; amountUsd: Prisma.Decimal | number | string; paypalCaptureId: string; createdAt: Date }) {
  const amount = usd(d.amountUsd);
  await enqueue(tx, "donation", d.id, "donation", d.donorPublicId, amount, {
    v: 1,
    kind: "donation",
    id: d.id,
    donor: d.donorPublicId,
    amount_usd: amount,
    paypal_capture_id: d.paypalCaptureId,
    at: d.createdAt.toISOString(),
  });
}

export async function enqueueDecision(tx: Db, d: { id: string; claimPublicId: string; actor: string; outcome: string; score: number | null; reason: string; createdAt: Date }) {
  await enqueue(tx, "decision", d.id, `decision.${d.outcome.toLowerCase()}`, d.claimPublicId, "0.00", {
    v: 1,
    kind: "decision",
    id: d.id,
    claim: d.claimPublicId,
    actor: d.actor, // "engine" or a reviewer's anonymous id
    outcome: d.outcome,
    score: d.score,
    reason_sha256: sha256(d.reason), // free text never goes on the public record
    at: d.createdAt.toISOString(),
  });
}

export async function enqueuePayout(tx: Db, p: { id: string; claimPublicId: string; amountUsd: Prisma.Decimal | number | string; senderBatchId: string; payoutBatchId: string | null; createdAt: Date }) {
  const amount = usd(p.amountUsd);
  await enqueue(tx, "payout", p.id, "payout", p.claimPublicId, amount, {
    v: 1,
    kind: "payout",
    id: p.id,
    claim: p.claimPublicId,
    amount_usd: amount,
    paypal_sender_batch_id: p.senderBatchId,
    paypal_payout_batch_id: p.payoutBatchId,
    at: p.createdAt.toISOString(),
  });
}

/** Ask the in-process worker (if running) to send soon. Never blocks the caller. */
let kicker: (() => void) | undefined;
export function setTrailKicker(fn: () => void) {
  kicker = fn;
}
function kick() {
  if (kicker) setTimeout(kicker, 500);
}

export function explorerTxUrl(signature: string, base = process.env.SOLANA_EXPLORER_BASE || "https://explorer.solana.com"): string {
  return `${base.replace(/\/+$/, "")}/tx/${signature}?cluster=devnet`;
}
