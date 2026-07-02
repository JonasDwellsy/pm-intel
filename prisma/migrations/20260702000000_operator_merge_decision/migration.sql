-- CreateTable
CREATE TABLE "OperatorMergeDecision" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "canonicalName" TEXT,
    "survivorSlug" TEXT,
    "memberSlugs" TEXT NOT NULL DEFAULT '[]',
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorMergeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorMergeDecision_marketId_clusterKey_key" ON "OperatorMergeDecision"("marketId", "clusterKey");

-- CreateIndex
CREATE INDEX "OperatorMergeDecision_marketId_idx" ON "OperatorMergeDecision"("marketId");
