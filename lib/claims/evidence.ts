import { db } from "@/lib/db";

/**
 * Claim evidence (photo + optional voice note) for the time verification runs, then deleted.
 *  - Render Workflows: stored in Postgres (claim_evidence) so each task instance can read it by claim id
 *    over Render's private network.
 *  - Inline (local dev): kept in this process's memory only. Reading ~0.5 MB back from Render Postgres
 *    over the public internet took 15–20 s from a laptop (measured 2026-11-07) and slow transfers were
 *    being reset, so inline mode never round-trips the bytes.
 */
export type Evidence = { photo: Uint8Array; photoMime: string; audio: Uint8Array | null; audioMime: string | null };

const local = new Map<string, Evidence>();

export function keepLocal(claimId: string, ev: Evidence): void {
  local.set(claimId, ev);
}

export async function getEvidence(claimId: string, part: "photo" | "audio" | "all" = "all"): Promise<Evidence | null> {
  const m = local.get(claimId);
  if (m) return m;
  const row = await db.claimEvidence.findUnique({
    where: { claimId },
    select: { photo: part !== "audio", photoMime: true, audio: part !== "photo", audioMime: true },
  });
  if (!row) return null;
  return {
    photo: row.photo ? new Uint8Array(row.photo) : new Uint8Array(),
    photoMime: row.photoMime,
    audio: row.audio ? new Uint8Array(row.audio) : null,
    audioMime: row.audioMime ?? null,
  };
}

/** Called with the decision: the bytes are gone from memory and from Postgres. */
export async function dropEvidence(claimId: string): Promise<void> {
  local.delete(claimId);
  await db.claimEvidence.deleteMany({ where: { claimId } });
}
