/**
 * npm run clip:prefetch — download the CLIP model into the transformers.js cache at BUILD time
 * (Render build command), so the first claim after a deploy doesn't pay the download.
 */
import sharp from "sharp";
import { clipModelId, embedImage } from "@/lib/vision/clip";

(async () => {
  const t = Date.now();
  const img = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#808080" } }).jpeg().toBuffer();
  const v = await embedImage(new Uint8Array(img));
  console.log(`CLIP ${clipModelId()} ready (${v.length} dims) in ${((Date.now() - t) / 1000).toFixed(1)} s`);
})().catch((e) => {
  console.error("clip:prefetch failed:", e instanceof Error ? e.message.slice(0, 200) : "error");
  process.exit(1);
});
