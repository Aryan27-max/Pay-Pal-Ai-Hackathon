-- AlterTable
ALTER TABLE "claim" ADD COLUMN     "audio_sha256" TEXT,
ADD COLUMN     "event_source" TEXT,
ADD COLUMN     "kernel_replay_url" TEXT,
ADD COLUMN     "kernel_status" TEXT,
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "transcript_lang" TEXT;

-- CreateTable
CREATE TABLE "claim_evidence" (
    "claim_id" UUID NOT NULL,
    "photo" BYTEA NOT NULL,
    "photo_mime" TEXT NOT NULL,
    "audio" BYTEA,
    "audio_mime" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_evidence_pkey" PRIMARY KEY ("claim_id")
);

-- CreateTable
CREATE TABLE "feed_cache" (
    "key" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "alert_sent" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_sent_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
