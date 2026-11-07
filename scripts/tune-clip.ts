/**
 * npm run clip:tune — cosine similarity between every pair of fixture photos (CLIP, same code path as
 * verification). Used to pick CLIP_DUPLICATE_THRESHOLD (architecture.md §5): the cropped fake must be
 * at or above it, every pair of DIFFERENT scenes below it.
 */
import fs from "node:fs";
import path from "node:path";
import { CLIP_DUPLICATE_THRESHOLD } from "@/lib/scoring";
import { cosine, embedImage } from "@/lib/vision/clip";

const DIR = path.resolve(__dirname, "..", "simulators", "fixtures", "photos");
/** Pairs that ARE the same scene (a reuse the check must catch). */
const SAME_SCENE = new Set(["fake-cropped-photo.jpg|genuine-1.jpg"]);

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".jpg")).sort();
  const vec: Record<string, number[]> = {};
  for (const f of files) vec[f] = await embedImage(new Uint8Array(fs.readFileSync(path.join(DIR, f))));
  let minSame = 1;
  let maxDiff = { v: -1, pair: "" };
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i]!;
      const b = files[j]!;
      const c = cosine(vec[a]!, vec[b]!);
      const same = SAME_SCENE.has(`${a}|${b}`) || SAME_SCENE.has(`${b}|${a}`);
      if (same) minSame = Math.min(minSame, c);
      else if (c > maxDiff.v) maxDiff = { v: c, pair: `${a} ~ ${b}` };
      console.log(`${same ? "SAME" : "    "} ${c.toFixed(4)}  ${a} ~ ${b}`);
    }
  }
  console.log(`\nlowest same-scene pair:     ${minSame.toFixed(4)}`);
  console.log(`highest different-scene pair: ${maxDiff.v.toFixed(4)}  (${maxDiff.pair})`);
  console.log(`threshold ${CLIP_DUPLICATE_THRESHOLD}: ${minSame >= CLIP_DUPLICATE_THRESHOLD && maxDiff.v < CLIP_DUPLICATE_THRESHOLD ? "separates them" : "DOES NOT separate them"}`);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
