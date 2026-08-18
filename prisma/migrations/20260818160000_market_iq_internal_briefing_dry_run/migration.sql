-- CreateTable
CREATE TABLE "MarketIqBriefingEmailRun" (
    "id" TEXT NOT NULL,
    "triggerKind" TEXT NOT NULL DEFAULT 'scheduled',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'running',
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqBriefingEmailRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketIqBriefingEmailRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "userId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIqBriefingEmailRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketIqBriefingEmailRun_status_startedAt_idx" ON "MarketIqBriefingEmailRun"("status", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketIqBriefingEmailRun_triggerKind_startedAt_idx" ON "MarketIqBriefingEmailRun"("triggerKind", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketIqBriefingEmailRunItem_runId_preferenceId_key" ON "MarketIqBriefingEmailRunItem"("runId", "preferenceId");

-- CreateIndex
CREATE INDEX "MarketIqBriefingEmailRunItem_organizationId_createdAt_idx" ON "MarketIqBriefingEmailRunItem"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketIqBriefingEmailRunItem_runId_status_idx" ON "MarketIqBriefingEmailRunItem"("runId", "status");

-- AddForeignKey
ALTER TABLE "MarketIqBriefingEmailRunItem" ADD CONSTRAINT "MarketIqBriefingEmailRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketIqBriefingEmailRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketIqBriefingEmailRunItem" ADD CONSTRAINT "MarketIqBriefingEmailRunItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketIqBriefingEmailRunItem" ADD CONSTRAINT "MarketIqBriefingEmailRunItem_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "MarketIqBriefingEmailPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketIqBriefingEmailRunItem" ADD CONSTRAINT "MarketIqBriefingEmailRunItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketIqBriefingSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
