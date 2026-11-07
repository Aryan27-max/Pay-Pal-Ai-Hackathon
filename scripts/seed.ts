/**
 * npm run seed — import validated AI assessments for the demo FIXTURES (simulators/fixtures/ai-cache-seed.json)
 * into ai_cache, so a judge's scripted demo makes no AI calls (zero cost) while every real claim still calls
 * the AI. The rows hold scores + a short explanation only: no photos, messages, emails or GPS.
 * Keys include the model id and prompt version, so they only hit when the judge uses the same model and
 * prompt; otherwise the demo simply calls the AI once per fixture and caches it.
 * npm run seed -- --export   writes the current fixture rows from ai_cache back to the seed file.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { AiAssessmentSchema } from "@/lib/ai/contract";
import { PROMPT_VERSION } from "@/lib/ai";

const FILE = path.join(__dirname, "..", "simulators", "fixtures", "ai-cache-seed.json");

type Row = { key: string; provider: string; model: string; photoSha256: string; messageSha256: string; promptVersion: string; assessment: unknown };

(async () => {
  if (process.argv.includes("--export")) {
    const rows = await db.aiCache.findMany({ where: { promptVersion: PROMPT_VERSION }, orderBy: { createdAt: "asc" } });
    const out = rows.map(({ key, provider, model, photoSha256, messageSha256, promptVersion, assessment }) => ({ key, provider, model, photoSha256, messageSha256, promptVersion, assessment }));
    fs.writeFileSync(FILE, JSON.stringify({ note: "Validated AI results for the demo fixtures only (scores + explanation). Imported by npm run seed.", promptVersion: PROMPT_VERSION, rows: out }, null, 2) + "\n");
    console.log(`exported ${out.length} fixture assessments (prompt ${PROMPT_VERSION}) → ${path.relative(process.cwd(), FILE)}`);
    return;
  }
  if (!fs.existsSync(FILE)) {
    console.log("no seed file: the first demo run calls the AI once per fixture and caches it.");
    return;
  }
  const { rows } = JSON.parse(fs.readFileSync(FILE, "utf8")) as { rows: Row[] };
  let ok = 0;
  let stale = 0;
  for (const r of rows) {
    if (!AiAssessmentSchema.safeParse(r.assessment).success) continue;
    if (r.promptVersion !== PROMPT_VERSION) {
      stale++;
      continue;
    }
    await db.aiCache.upsert({
      where: { key: r.key },
      create: { key: r.key, provider: r.provider, model: r.model, photoSha256: r.photoSha256, messageSha256: r.messageSha256, promptVersion: r.promptVersion, assessment: r.assessment as object },
      update: {},
    });
    ok++;
  }
  console.log(`seeded ${ok} fixture AI assessments${stale ? ` (${stale} skipped: older prompt version)` : ""}.`);
})()
  .catch((e) => {
    console.error("seed failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
