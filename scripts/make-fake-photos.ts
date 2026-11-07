/**
 * npx tsx scripts/make-fake-photos.ts [--from-downloads <dir>]
 *
 * Builds the derived fixture photos in simulators/fixtures/photos:
 *  - fake-cropped-photo.jpg: genuine-1.jpg cropped (82% × 85%, offset) and re-compressed at quality 62,
 *    so its SHA-256 differs from genuine-1 and only the near-duplicate check can catch the reuse.
 *  - fake-heavy-edit.jpg: genuine-1.jpg cropped to 75% × 78%, resized to 640 px wide, brightened ×1.2 and
 *    re-compressed at quality 70 (the "heavier edit" test: whole-photo CLIP alone gives 0.889).
 * With --from-downloads <dir> it also re-encodes the downloaded source images listed in CREDITS.md
 * (metadata stripped by the re-encode):
 *  - <dir>/ai-flood.png   → fake-ai-generated.jpg
 *  - <dir>/fema-34577.jpg → fake-outside-zone.jpg
 *  - <dir>/fema-34505.jpg → fake-contradictory-voice.jpg
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { sha256Hex } from "@/lib/privacy";

const PHOTOS = path.resolve(__dirname, "..", "simulators", "fixtures", "photos");

async function main() {
  const g1 = fs.readFileSync(path.join(PHOTOS, "genuine-1.jpg"));
  const m = await sharp(g1).metadata();
  if (!m.width || !m.height) throw new Error("genuine-1.jpg has no size");
  const crop = await sharp(g1)
    .extract({ left: Math.round(m.width * 0.08), top: Math.round(m.height * 0.06), width: Math.round(m.width * 0.82), height: Math.round(m.height * 0.85) })
    .jpeg({ quality: 62 })
    .toBuffer();
  fs.writeFileSync(path.join(PHOTOS, "fake-cropped-photo.jpg"), crop);
  console.log(`fake-cropped-photo.jpg  sha256 ${sha256Hex(crop).slice(0, 12)}… (genuine-1 ${sha256Hex(g1).slice(0, 12)}…)`);
  const heavy = await sharp(g1)
    .extract({ left: Math.floor(m.width * 0.12), top: Math.floor(m.height * 0.1), width: Math.floor(m.width * 0.75), height: Math.floor(m.height * 0.78) })
    .resize(640)
    .modulate({ brightness: 1.2 })
    .jpeg({ quality: 70 })
    .toBuffer();
  fs.writeFileSync(path.join(PHOTOS, "fake-heavy-edit.jpg"), heavy);
  console.log(`fake-heavy-edit.jpg     sha256 ${sha256Hex(heavy).slice(0, 12)}…`);

  const i = process.argv.indexOf("--from-downloads");
  if (i > 0) {
    const dir = process.argv[i + 1]!;
    const map: Array<[string, string]> = [
      ["ai-flood.png", "fake-ai-generated.jpg"],
      ["fema-34577.jpg", "fake-outside-zone.jpg"],
      ["fema-34505.jpg", "fake-contradictory-voice.jpg"],
    ];
    for (const [src, dst] of map) {
      const out = await sharp(fs.readFileSync(path.join(dir, src))).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
      fs.writeFileSync(path.join(PHOTOS, dst), out);
      console.log(`${dst.padEnd(30)} from ${src}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
