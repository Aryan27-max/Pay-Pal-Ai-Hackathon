/**
 * CLIP image embeddings on CPU with transformers.js (no API, no quota). Works locally and on Render.
 * Model: CLIP_MODEL_ID (default Xenova/clip-vit-base-patch32 = ONNX export of openai/clip-vit-base-patch32),
 * quantised q8 (~90 MB). Loaded once per process. Returns a unit-length 512-d vector (cosine = dot).
 * See .claude/skills/photo-forensics/SKILL.md.
 */
export const CLIP_DIMS = 512;
const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";

type Loaded = { embed: (bytes: Uint8Array) => Promise<number[]> };
let loading: Promise<Loaded> | undefined;

export function clipModelId(): string {
  return process.env.CLIP_MODEL_ID?.trim() || DEFAULT_MODEL;
}

/**
 * CLIP_MODE = local (default) | off. off never loads the model: the photo check then uses the perceptual
 * hash only. It is the switch for a host that is too small for the model (it needs ~250 MB on its own).
 */
export function clipEnabled(): boolean {
  return (process.env.CLIP_MODE?.trim() || "local") !== "off";
}

/**
 * Weights: CLIP_DTYPE = q8 (default) | q4. Measured on the fixtures (2026-11-08, standalone peak RSS while
 * embedding 4 photos × 7 crops): q8 293 MB, q4 250 MB; both keep the cropped fake at 0.941, the heavy edit at
 * 0.954–0.958 and the closest different photo at 0.903–0.904, so the 0.92 threshold holds. uint8 pushed a
 * different photo to 0.921 (false match) and fp16 peaked at 638 MB: not allowed.
 * Lean ONNX session (1 thread, no CPU memory arena / memory pattern) trims the arena on small hosts.
 */
export const CLIP_DTYPES = ["q8", "q4"] as const;

export function clipDtype(): (typeof CLIP_DTYPES)[number] {
  const d = process.env.CLIP_DTYPE?.trim() || "q8";
  return (CLIP_DTYPES as readonly string[]).includes(d) ? (d as (typeof CLIP_DTYPES)[number]) : "q8";
}

async function load(): Promise<Loaded> {
  const mode = process.env.CLIP_MODE?.trim() || "local";
  if (mode !== "local") throw new Error(`CLIP_MODE=${mode} is not supported (use local)`);
  // Loaded lazily on the first photo check (never at server start).
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import("@huggingface/transformers");
  const sharp = (await import("sharp")).default;
  sharp.cache(false); // no decoded-image cache: photos are processed once
  sharp.concurrency(1);
  const id = clipModelId();
  const processor = await AutoProcessor.from_pretrained(id);
  const model = await CLIPVisionModelWithProjection.from_pretrained(id, {
    dtype: clipDtype(),
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, enableCpuMemArena: false, enableMemPattern: false },
  });
  return {
    embed: async (bytes) => {
      const image = await RawImage.fromBlob(new Blob([Buffer.from(bytes)]));
      const { image_embeds } = (await model(await processor(image))) as { image_embeds: { data: Float32Array } };
      return normalise(Array.from(image_embeds.data));
    },
  };
}

export function normalise(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n > 0 ? v.map((x) => x / n) : v;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Crops stored for every indexed photo, so a cropped re-upload still finds its original: the query (full
 * photo) is compared with all of them. Fractions of width/height: [name, left, top, size].
 */
export const CROP_VARIANTS: Array<[string, number, number, number]> = [
  ["full", 0, 0, 1],
  ["c80", 0.1, 0.1, 0.8],
  ["c65", 0.175, 0.175, 0.65],
  ["tl75", 0, 0, 0.75],
  ["tr75", 0.25, 0, 0.75],
  ["bl75", 0, 0.25, 0.75],
  ["br75", 0.25, 0.25, 0.75],
];

/** Embeddings of the photo and its crops (7 × ~0.1 s on a laptop CPU). */
export async function embedCrops(bytes: Uint8Array): Promise<Array<{ variant: string; vec: number[] }>> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(Buffer.from(bytes)).rotate().metadata();
  const W = meta.autoOrient?.width ?? meta.width ?? 0;
  const H = meta.autoOrient?.height ?? meta.height ?? 0;
  const out: Array<{ variant: string; vec: number[] }> = [];
  for (const [variant, x, y, s] of CROP_VARIANTS) {
    if (s === 1 || !W || !H) {
      out.push({ variant, vec: await embedImage(bytes) });
      if (!W || !H) break;
      continue;
    }
    const left = Math.floor(W * x);
    const top = Math.floor(H * y);
    const crop = await sharp(Buffer.from(bytes))
      .rotate()
      .extract({ left, top, width: Math.min(W - left, Math.floor(W * s)), height: Math.min(H - top, Math.floor(H * s)) })
      .jpeg({ quality: 90 })
      .toBuffer();
    out.push({ variant, vec: await embedImage(new Uint8Array(crop)) });
  }
  return out;
}

export async function embedImage(bytes: Uint8Array): Promise<number[]> {
  loading ??= load().catch((e) => {
    loading = undefined; // allow a retry after a failed download
    throw e;
  });
  const vec = await (await loading).embed(bytes);
  if (vec.length !== CLIP_DIMS) throw new Error(`CLIP returned ${vec.length} dims, expected ${CLIP_DIMS}`);
  return vec;
}
