import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/** One Prisma client per process (hot reload safe). */
const g = globalThis as unknown as { __prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const adapter = new PrismaPg({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: true },
    max: 5,
    // A new TLS connection to Render Postgres costs ~3 s from a laptop (measured 2026-11-07) vs ~50 ms reused,
    // so keep pooled connections for 5 min (pg's default is 10 s) and keep them alive at the TCP level.
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    connectionTimeoutMillis: 20_000,
  });
  // maxWait covers a cold connection (~3 s from a laptop); Prisma's default is 2 s.
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 15_000, timeout: 60_000 } });
}

export const db: PrismaClient = g.__prisma ?? (g.__prisma = makeClient());
