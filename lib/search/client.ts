import { Client } from "@elastic/elasticsearch";
import { env } from "@/lib/env";
import { CLIP_DIMS } from "@/lib/vision/clip";

/**
 * Elastic (Serverless 9.x) through one client. Indices hold claim_public_id + vectors / rounded
 * location / event / status only: never photos, emails, names, messages or exact GPS.
 * See .claude/skills/elastic-search/SKILL.md.
 */
let client: Client | undefined;

/** On when ELASTIC_URL is set: local Docker Elasticsearch needs no key; Elastic Cloud also needs ELASTIC_API_KEY. */
export function elasticConfigured(): boolean {
  return Boolean(env().ELASTIC_URL);
}

export function es(): Client {
  if (!elasticConfigured()) throw new Error("disabled: no key (ELASTIC_URL)");
  const e = env();
  client ??= new Client({ node: e.ELASTIC_URL, ...(e.ELASTIC_API_KEY ? { auth: { apiKey: e.ELASTIC_API_KEY } } : {}), requestTimeout: 15_000, maxRetries: 2 });
  return client;
}

export const indices = () => ({ photos: env().ELASTIC_PHOTOS_INDEX, claims: env().ELASTIC_CLAIMS_INDEX });

export const PHOTOS_MAPPING = {
  properties: {
    claim_public_id: { type: "keyword" },
    variant: { type: "keyword" }, // full | c80 | c65 | tl75 | tr75 | bl75 | br75 (lib/vision/clip CROP_VARIANTS)
    embedding: { type: "dense_vector", dims: CLIP_DIMS, index: true, similarity: "cosine" },
    created_at: { type: "date" },
  },
} as const;

export const CLAIMS_MAPPING = {
  properties: {
    claim_public_id: { type: "keyword" },
    location: { type: "geo_point" },
    event_id: { type: "keyword" },
    status: { type: "keyword" },
    duplicate: { type: "boolean" },
    updated_at: { type: "date" },
  },
} as const;

/** Create both indices if missing (idempotent). Serverless: mappings only, no shard settings. */
export async function ensureIndices(): Promise<{ created: string[] }> {
  const created: string[] = [];
  const { photos, claims } = indices();
  const specs: Array<[string, unknown]> = [
    [photos, PHOTOS_MAPPING],
    [claims, CLAIMS_MAPPING],
  ];
  for (const [index, mappings] of specs) {
    if (!(await es().indices.exists({ index }))) {
      await es().indices.create({ index, mappings: mappings as never });
      created.push(index);
    }
  }
  return { created };
}

/** Elastic's kNN _score for cosine is (1 + cos) / 2. */
export const scoreToCosine = (score: number) => 2 * score - 1;
