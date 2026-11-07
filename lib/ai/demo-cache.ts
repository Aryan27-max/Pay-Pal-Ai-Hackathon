import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { AiAssessmentSchema, type AiAssessment } from "./contract";
import type { ProviderName } from "./providers";

/**
 * Demo cache (AI_DEMO_CACHE). Only claims whose photo bytes, message text AND voice clip all match a
 * simulator fixture (simulators/fixtures/claims.json) can use it. That is decided on the server
 * from content hashes, never from a client flag, so a real claim through /api/claims always calls
 * the AI. Entries are keyed by photo sha + message sha + model + prompt version, so changing
 * the prompt or the model gets a fresh assessment.
 */

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

export const messageSha256 = (message: string) => sha(message.trim());

/** on | off; empty or unset = on in development/test, off in production. */
export function demoCacheEnabled(flag = process.env.AI_DEMO_CACHE, nodeEnv = process.env.NODE_ENV): boolean {
  const f = (flag ?? "").trim().toLowerCase();
  if (f === "on") return true;
  if (f === "off") return false;
  return nodeEnv !== "production";
}

export function cacheKey(photoSha256: string, msgSha256: string, model: string, promptVersion: string): string {
  return sha(`${photoSha256}|${msgSha256}|${model}|${promptVersion}`);
}

let fixtureSet: Set<string> | undefined;

/** Identity of a claim's evidence: photo sha | typed-message sha | voice sha ("-" when there is none). */
export const evidenceKey = (photoSha256: string, msgSha256: string, audioSha256?: string | null) => `${photoSha256}|${msgSha256}|${audioSha256 || "-"}`;

/**
 * Evidence keys of every fixture claim, read once from the repo. A voice fixture counts with its clip
 * (if the file exists) and also as its text-only fallback (sent while the clip is not recorded yet).
 */
export function fixturePairs(root = process.cwd()): Set<string> {
  if (fixtureSet) return fixtureSet;
  const dir = path.join(root, "simulators", "fixtures");
  const set = new Set<string>();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8")) as {
      claims?: Array<{ photo?: unknown; message?: unknown; audio?: unknown; fallbackMessage?: unknown }>;
    };
    for (const c of raw.claims ?? []) {
      if (typeof c.photo !== "string") continue;
      const p = path.join(dir, "photos", path.basename(c.photo));
      if (!fs.existsSync(p)) continue;
      const photoSha = sha(fs.readFileSync(p));
      const message = typeof c.message === "string" ? c.message : "";
      const audioBase = typeof c.audio === "string" ? path.basename(c.audio) : null;
      const audio = audioBase
        ? [".m4a", ".mp3", ".wav", ".ogg", ".webm"].map((ext) => path.join(dir, "audio", audioBase + ext)).find((f) => fs.existsSync(f))
        : undefined;
      if (audio) set.add(evidenceKey(photoSha, messageSha256(message), sha(fs.readFileSync(audio))));
      if (!audioBase) set.add(evidenceKey(photoSha, messageSha256(message)));
      if (typeof c.fallbackMessage === "string") set.add(evidenceKey(photoSha, messageSha256(c.fallbackMessage)));
    }
  } catch {
    /* no fixtures shipped → nothing is cacheable */
  }
  return (fixtureSet = set);
}

export function isFixtureClaim(photoSha256: string, msgSha256: string, audioSha256?: string | null): boolean {
  return fixturePairs().has(evidenceKey(photoSha256, msgSha256, audioSha256));
}

export type CachedAssessment = { provider: ProviderName; model: string; assessment: AiAssessment };

export type AssessmentCache = {
  get(key: string): Promise<CachedAssessment | null>;
  put(key: string, v: CachedAssessment & { photoSha256: string; messageSha256: string; promptVersion: string }): Promise<void>;
};

/** Postgres-backed cache (table ai_cache). Anything that fails the contract is ignored. */
export const dbCache: AssessmentCache = {
  async get(key) {
    const row = await db.aiCache.findUnique({ where: { key } });
    if (!row) return null;
    const parsed = AiAssessmentSchema.safeParse(row.assessment);
    if (!parsed.success || (row.provider !== "gemini" && row.provider !== "groq")) return null;
    return { provider: row.provider, model: row.model, assessment: parsed.data };
  },
  async put(key, v) {
    await db.aiCache.upsert({
      where: { key },
      create: { key, provider: v.provider, model: v.model, photoSha256: v.photoSha256, messageSha256: v.messageSha256, promptVersion: v.promptVersion, assessment: v.assessment },
      update: {},
    });
  },
};
