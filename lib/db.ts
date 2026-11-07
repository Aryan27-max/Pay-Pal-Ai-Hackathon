import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/** One Prisma client per process (hot reload safe). */
const g = globalThis as unknown as { __prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const adapter = new PrismaPg({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true }, max: 5 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = g.__prisma ?? (g.__prisma = makeClient());
