-- CreateTable
CREATE TABLE "trail_entry" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_usd" TEXT NOT NULL,
    "row_json" JSONB NOT NULL,
    "row_sha256" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "signature" TEXT,
    "mode" TEXT,
    "error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trail_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trail_entry_status_next_attempt_at_idx" ON "trail_entry"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "trail_entry_kind_ref_id_key" ON "trail_entry"("kind", "ref_id");
