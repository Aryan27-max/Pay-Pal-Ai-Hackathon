import bs58 from "bs58";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedWithTransferHookInstruction, getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { db } from "@/lib/db";
import { serviceEnabled } from "@/lib/services";
import { setTrailKicker } from "./index";

/**
 * Background sender for the trail queue (started by instrumentation.ts; also `npm run trail:flush`).
 * Each entry = one devnet transaction from the trail wallet: a 0.000001 test-PYUSD self-transfer
 * (Token-2022 transferChecked, transfer-hook aware) + a Memo with the entry's memo. Without test PYUSD in
 * the wallet it falls back to memo-only (fees in devnet SOL). DEVNET ONLY: refuses any other RPC.
 *
 * Exactly-once on chain, without blocking anything:
 *  - the signature is stored BEFORE sending; a retry first asks the chain about that signature;
 *  - a SENT entry whose signature never landed is re-sent only after 2 minutes (its blockhash has expired
 *    by then, so the old transaction can no longer land);
 *  - failures back off 15 s × 2^attempts, max 8 attempts, then FAILED (visible on /admin and /dashboard).
 */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MAX_ATTEMPTS = 8;
const RESEND_AFTER_MS = 120_000;

type Ctx = { conn: Connection; kp: Keypair; mint: PublicKey; ata: PublicKey; decimals: number; hasPyusd: boolean };

export function walletFromSecret(secret: string): Keypair {
  const s = secret.trim();
  return Keypair.fromSecretKey(s.startsWith("[") ? Uint8Array.from(JSON.parse(s) as number[]) : bs58.decode(s));
}

async function context(): Promise<Ctx> {
  const rpc = process.env.SOLANA_RPC_URL!;
  if (!/devnet/.test(rpc)) throw new Error("SOLANA_RPC_URL must be a devnet endpoint (devnet only)");
  const conn = new Connection(rpc, "confirmed");
  const kp = walletFromSecret(process.env.SOLANA_TRAIL_WALLET_SECRET_KEY!);
  const mint = new PublicKey(process.env.PYUSD_DEVNET_MINT!);
  const ata = getAssociatedTokenAddressSync(mint, kp.publicKey, false, TOKEN_2022_PROGRAM_ID);
  let decimals = 6;
  let hasPyusd = false;
  try {
    decimals = (await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID)).decimals;
    hasPyusd = BigInt((await conn.getTokenAccountBalance(ata)).value.amount) > 0n;
  } catch {
    hasPyusd = false; // no token account yet → memo-only
  }
  return { conn, kp, mint, ata, decimals, hasPyusd };
}

async function buildTx(ctx: Ctx, memo: string): Promise<{ tx: Transaction; mode: string; blockhash: string; lastValidBlockHeight: number }> {
  const ixs: TransactionInstruction[] = [];
  let mode = "memo-only";
  if (ctx.hasPyusd) {
    ixs.push(await createTransferCheckedWithTransferHookInstruction(ctx.conn, ctx.ata, ctx.mint, ctx.ata, ctx.kp.publicKey, 1n, ctx.decimals, [], "confirmed", TOKEN_2022_PROGRAM_ID));
    mode = "pyusd+memo";
  }
  ixs.push(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: ctx.kp.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
  const { blockhash, lastValidBlockHeight } = await ctx.conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: ctx.kp.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(ctx.kp);
  return { tx, mode, blockhash, lastValidBlockHeight };
}

/** Copy a confirmed signature onto the source row (donation / decision / payout). */
async function markSource(kind: string, refId: string, sig: string) {
  if (kind === "donation") await db.donation.updateMany({ where: { id: refId }, data: { solanaTx: sig } });
  else if (kind === "decision") await db.decision.updateMany({ where: { id: refId }, data: { solanaTx: sig } });
  else if (kind === "payout") await db.payout.updateMany({ where: { id: refId }, data: { solanaTx: sig } });
}

const backoff = (attempts: number) => new Date(Date.now() + 15_000 * 2 ** Math.min(attempts, 6));

export type FlushReport = { confirmed: number; failed: number; pending: number; disabled: boolean };

export async function processTrailQueue(limit = 10): Promise<FlushReport> {
  if (!serviceEnabled(process.env, "solana")) {
    const n = await db.trailEntry.updateMany({ where: { status: "PENDING" }, data: { status: "DISABLED", error: "disabled: no key (Solana)" } });
    return { confirmed: 0, failed: 0, pending: n.count, disabled: true };
  }
  // Re-enable entries parked while the trail was disabled.
  await db.trailEntry.updateMany({ where: { status: "DISABLED" }, data: { status: "PENDING", error: null } });

  const due = await db.trailEntry.findMany({
    where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: new Date() } }, { status: "SENT", updatedAt: { lte: new Date(Date.now() - 20_000) } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const report: FlushReport = { confirmed: 0, failed: 0, pending: 0, disabled: false };
  if (!due.length) return report;
  let ctx: Ctx;
  try {
    ctx = await context();
  } catch (e) {
    console.error(`[trail] ${e instanceof Error ? e.message.slice(0, 160) : "context failed"}`);
    return { ...report, pending: due.length };
  }

  for (const e of due) {
    // Lease: only one worker handles an entry.
    const leased = await db.trailEntry.updateMany({ where: { id: e.id, status: e.status, updatedAt: e.updatedAt }, data: { status: "SENDING" } });
    if (leased.count !== 1) continue;
    try {
      // 1. Already sent (accepted by the RPC)? Ask the chain about the stored signature first.
      if (e.signature && e.status === "SENT") {
        const st = (await ctx.conn.getSignatureStatuses([e.signature], { searchTransactionHistory: true })).value[0];
        if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
          await db.trailEntry.update({ where: { id: e.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), error: null } });
          await markSource(e.kind, e.refId, e.signature);
          report.confirmed++;
          continue;
        }
        // nextAttemptAt holds the send time of a SENT entry (updatedAt moves on every check).
        if (!st && Date.now() - e.nextAttemptAt.getTime() < RESEND_AFTER_MS) {
          await db.trailEntry.update({ where: { id: e.id }, data: { status: "SENT" } }); // still in flight
          report.pending++;
          continue;
        }
        // st.err (failed on chain) or not found after the blockhash expired → send a new transaction.
      }
      // 2. Build, store the signature, then send and confirm.
      const { tx, mode, blockhash, lastValidBlockHeight } = await buildTx(ctx, e.memo);
      const sig = bs58.encode(tx.signature!);
      await db.trailEntry.update({ where: { id: e.id }, data: { status: "SENT", signature: sig, mode, nextAttemptAt: new Date() } });
      try {
        await ctx.conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      } catch (sendErr) {
        // Rejected before it left (e.g. preflight: no SOL for fees): it can never land, so forget the signature.
        await db.trailEntry.update({ where: { id: e.id }, data: { status: "SENDING", signature: null } });
        throw sendErr;
      }
      // Accepted by the RPC: from here a timeout leaves it SENT and the next pass asks the chain (no duplicate).
      const res = await ctx.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed").catch((err) => {
        throw Object.assign(new Error(`not confirmed yet: ${err instanceof Error ? err.message.slice(0, 80) : "timeout"}`), { inFlight: true });
      });
      if (res.value.err) throw new Error(`on-chain error: ${JSON.stringify(res.value.err).slice(0, 120)}`);
      await db.trailEntry.update({ where: { id: e.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), error: null } });
      await markSource(e.kind, e.refId, sig);
      report.confirmed++;
    } catch (err) {
      if ((err as { inFlight?: boolean }).inFlight) {
        await db.trailEntry.update({ where: { id: e.id }, data: { status: "SENT", error: (err as Error).message } });
        report.pending++;
        continue;
      }
      const attempts = e.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.trailEntry.update({
        where: { id: e.id },
        data: { status: failed ? "FAILED" : "PENDING", attempts, nextAttemptAt: backoff(attempts), error: (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 300) },
      });
      if (failed) report.failed++;
      else report.pending++;
    }
  }
  return report;
}

let running: Promise<FlushReport> | null = null;
/** Single-flight per process. */
export function flushSoon(): Promise<FlushReport> {
  running ??= processTrailQueue().finally(() => (running = null));
  return running;
}

let started = false;
export function startTrailWorker(everyMs = 15_000): void {
  if (started) return;
  started = true;
  setTrailKicker(() => void flushSoon().catch(() => undefined));
  setInterval(() => void flushSoon().catch((e) => console.error(`[trail] ${e instanceof Error ? e.message.slice(0, 120) : "error"}`)), everyMs).unref?.();
}
