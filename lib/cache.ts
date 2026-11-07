import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Two-level cache for feeds and Kernel checks: an in-process memo (saves the DB round trip when the
 * location and vouching checks read the same feed in one claim) in front of Postgres (table feed_cache,
 * shared by every web and workflow instance).
 * `cached(key, ttlMs, fetcher, { staleMs })`: fresh hit → value; miss → fetch + store; fetch failure →
 * the last good value if it is younger than staleMs, else the error.
 */
const memo = new Map<string, { value: unknown; at: number }>();
const inflight = new Map<string, Promise<{ value: unknown; hit: boolean; stale: boolean }>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts: { staleMs?: number } = {},
): Promise<{ value: T; hit: boolean; stale: boolean }> {
  const m = memo.get(key);
  if (m && Date.now() - m.at < ttlMs) return { value: m.value as T, hit: true, stale: false };
  // Concurrent callers for the same key share one lookup/fetch.
  const running = inflight.get(key);
  if (running) return running as Promise<{ value: T; hit: boolean; stale: boolean }>;
  const p = (async () => {
    const row = await db.feedCache.findUnique({ where: { key } }).catch(() => null);
    const age = row ? Date.now() - row.fetchedAt.getTime() : Infinity;
    if (row && age < ttlMs) {
      memo.set(key, { value: row.body, at: row.fetchedAt.getTime() });
      return { value: row.body as T, hit: true, stale: false };
    }
    try {
      const value = await fetcher();
      const body = value as unknown as Prisma.InputJsonValue;
      memo.set(key, { value, at: Date.now() });
      await db.feedCache.upsert({ where: { key }, create: { key, body }, update: { body, fetchedAt: new Date() } }).catch(() => undefined);
      return { value, hit: false, stale: false };
    } catch (e) {
      if (row && age < (opts.staleMs ?? 0)) return { value: row.body as T, hit: true, stale: true };
      throw e;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p as Promise<{ value: T; hit: boolean; stale: boolean }>;
}
