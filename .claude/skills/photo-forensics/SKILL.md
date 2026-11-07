---
name: photo-forensics
description: Use for any photo check — EXIF time/GPS plausibility, SHA-256, CLIP embeddings (transformers.js on CPU), near-duplicate detection and the AI-generated-image risk from lib/ai.
---

# photo-forensics

## Purpose

The photo signal (weight 30) and the photo half of uniqueness. Everything that can be decided by code is
code: EXIF plausibility, exact-hash duplicates, CLIP near-duplicates. Only "does it show this disaster?" and
"is it AI-generated?" come from the single AI call (see `gemini-ai`).

## Files it owns

- `lib/vision/exif.ts` — `readExif(bytes)` → `{ present, takenAt?, gps? }` (exifr)
- `lib/vision/clip.ts` — `embedImage(bytes)` → unit-length `number[512]` (transformers.js, CPU)
- `lib/scoring` — `exifFactor()`, `photoSignal()` (pure, tested)
- `simulators/fixtures/photos/` + `CREDITS.md` (public-domain / self-made only)
- `scripts/tune-clip.ts` — prints the similarity matrix used to pick the threshold

## Env vars

`CLIP_MODE` (`local` only; the HF Inference API is not used), `CLIP_MODEL_ID` (`Xenova/clip-vit-base-patch32`,
the ONNX export of `openai/clip-vit-base-patch32`), `ELASTIC_PHOTOS_INDEX`.

## How to

1. **Hash:** `sha256Hex(bytes)` (lib/privacy). Same hash on another claim = exact duplicate → uniqueness 0.
2. **EXIF** (exifr 7): `exifr.parse(buf, { pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude"], gps: true })`
   returns `undefined` when there is no EXIF. Missing EXIF is **not** a fail (WhatsApp, Signal and most
   upload paths strip it): `exifFactor` = 1.0 plausible, 0.9 missing, 0.6 contradicting
   (taken > 1 day before the event start or in the future, or EXIF GPS > 50 km from the claim GPS).
3. **CLIP:** transformers.js v4, CPU, quantised `q8` weights (~90 MB, ~0.1 s per photo):
   ```ts
   import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
   const processor = await AutoProcessor.from_pretrained(MODEL);
   const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
   const { image_embeds } = await model(await processor(await RawImage.fromBlob(new Blob([bytes]))));
   ```
   Normalise to unit length before storing (cosine = dot product).
4. **Near-duplicate:** kNN in `ELASTIC_PHOTOS_INDEX` (see `elastic-search`), excluding the claim itself.
   Raw cosine ≥ `CLIP_DUPLICATE_THRESHOLD` (0.90, architecture.md §5) → reused photo → uniqueness 0.
   Elastic's `_score` for cosine is `(1 + cos) / 2`; convert back with `cos = 2·score − 1`.
5. **AI-generated:** `photo_ai_generated_risk` from the single AI call. `photoSignal` multiplies by
   `(1 − risk)`; a risk ≥ 0.8 is shown as a red flag and the core-evidence floor keeps it from auto-payout.

## Gotchas

- The first `from_pretrained` downloads the model into `node_modules/@huggingface/transformers/.cache`;
  load once per process (module-level promise). On Render the first claim after a deploy pays the download.
- `onnxruntime-node` ships CPU binaries for win32/linux/darwin; its postinstall only fetches CUDA files, so
  `npm approve-scripts` is not needed.
- Never store the photo or the vector next to PII. The photos index holds `claim_public_id`, the vector and a
  timestamp only.
- Photos are held in Postgres (`claim_evidence`) only until verification finishes, then deleted.

## Test

- `tests/photo.test.ts`: `exifFactor` cases (missing, plausible, too old, far GPS) and `photoSignal`.
- `npx tsx scripts/tune-clip.ts`: the crop of genuine-1 must be ≥ threshold, every distinct pair below.
- `npm run sim:demo`: `fake-cropped-photo` REJECTED by the CLIP check; `fake-ai-generated` flagged.
