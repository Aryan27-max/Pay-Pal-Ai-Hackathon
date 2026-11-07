-- CreateTable
CREATE TABLE "ai_usage" (
    "day" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("day","provider")
);
