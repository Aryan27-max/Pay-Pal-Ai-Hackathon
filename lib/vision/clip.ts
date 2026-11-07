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

async function load(): Promise<Loaded> {
  const mode = process.env.CLIP_MODE?.trim() || "local";
  if (mode !== "local") throw new Error(`CLIP_MODE=${mode} is not supported (use local)`);
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import("@huggingface/transformers");
  const id = clipModelId();
  const processor = await AutoProcessor.from_pretrained(id);
  const model = await CLIPVisionModelWithProjection.from_pretrained(id, { dtype: "q8" });
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

export async function embedImage(bytes: Uint8Array): Promise<number[]> {
  loading ??= load().catch((e) => {
    loading = undefined; // allow a retry after a failed download
    throw e;
  });
  const vec = await (await loading).embed(bytes);
  if (vec.length !== CLIP_DIMS) throw new Error(`CLIP returned ${vec.length} dims, expected ${CLIP_DIMS}`);
  return vec;
}
