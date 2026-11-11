-- CLIP crop embeddings in Postgres, used only when Elasticsearch is not configured (free hosting).
-- CreateTable
CREATE TABLE "photo_embedding" (
    "claim_public_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "vec" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_embedding_pkey" PRIMARY KEY ("claim_public_id","variant")
);

-- CreateIndex
CREATE INDEX "photo_embedding_created_at_idx" ON "photo_embedding"("created_at");

-- AddForeignKey
ALTER TABLE "photo_embedding" ADD CONSTRAINT "photo_embedding_claim_public_id_fkey" FOREIGN KEY ("claim_public_id") REFERENCES "claim"("claim_public_id") ON DELETE CASCADE ON UPDATE CASCADE;
