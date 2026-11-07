-- CreateTable
CREATE TABLE "donation" (
    "id" UUID NOT NULL,
    "paypal_order_id" TEXT NOT NULL,
    "paypal_capture_id" TEXT NOT NULL,
    "donor_public_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(12,2) NOT NULL,
    "remaining_usd" DECIMAL(12,2) NOT NULL,
    "stream_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'paypal_button',
    "solana_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim" (
    "id" UUID NOT NULL,
    "claim_public_id" TEXT NOT NULL,
    "paypal_email" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "geo_cell" TEXT NOT NULL,
    "disaster_event_id" TEXT,
    "photo_sha256" TEXT NOT NULL,
    "message_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "score" INTEGER,
    "signals" JSONB,
    "ai_explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "score" INTEGER,
    "reason" TEXT NOT NULL,
    "solana_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "sender_batch_id" TEXT NOT NULL,
    "payout_batch_id" TEXT,
    "payout_item_id" TEXT,
    "amount_usd" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "solana_tx" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation" (
    "id" UUID NOT NULL,
    "donation_id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "amount_usd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donation_paypal_order_id_key" ON "donation"("paypal_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_paypal_capture_id_key" ON "donation"("paypal_capture_id");

-- CreateIndex
CREATE INDEX "donation_donor_public_id_idx" ON "donation"("donor_public_id");

-- CreateIndex
CREATE INDEX "donation_created_at_idx" ON "donation"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "claim_claim_public_id_key" ON "claim"("claim_public_id");

-- CreateIndex
CREATE INDEX "claim_paypal_email_idx" ON "claim"("paypal_email");

-- CreateIndex
CREATE INDEX "claim_photo_sha256_idx" ON "claim"("photo_sha256");

-- CreateIndex
CREATE INDEX "claim_status_idx" ON "claim"("status");

-- CreateIndex
CREATE INDEX "decision_claim_id_idx" ON "decision"("claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_sender_batch_id_key" ON "payout"("sender_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_claim_id_attempt_key" ON "payout"("claim_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_donation_id_payout_id_key" ON "allocation"("donation_id", "payout_id");

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
