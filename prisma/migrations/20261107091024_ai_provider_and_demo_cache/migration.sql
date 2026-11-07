-- AlterTable
ALTER TABLE "claim" ADD COLUMN     "ai_cached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "ai_provider" TEXT;

-- CreateTable
CREATE TABLE "ai_cache" (
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "photo_sha256" TEXT NOT NULL,
    "message_sha256" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "assessment" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("key")
);
