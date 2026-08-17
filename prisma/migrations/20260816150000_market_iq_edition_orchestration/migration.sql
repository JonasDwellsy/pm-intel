-- Additive Market IQ scheduler ledger. This migration does not alter any
-- Operator IQ or Portfolio IQ table, route, entitlement, or email workflow.
CREATE TABLE "MarketIqEditionOrchestrationRun" (
  "id" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "triggerKind" TEXT NOT NULL DEFAULT 'scheduled',
  "status" TEXT NOT NULL DEFAULT 'running',
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "organizationsEvaluated" INTEGER NOT NULL DEFAULT 0,
  "draftsCreated" INTEGER NOT NULL DEFAULT 0,
  "draftsExisting" INTEGER NOT NULL DEFAULT 0,
  "unchangedPeriods" INTEGER NOT NULL DEFAULT 0,
  "blockedOrganizations" INTEGER NOT NULL DEFAULT 0,
  "failedOrganizations" INTEGER NOT NULL DEFAULT 0,
  "sourceAvailableThrough" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqEditionOrchestrationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqEditionOrchestrationItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "periodEnd" TEXT,
  "draftId" TEXT,
  "detail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqEditionOrchestrationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqEditionOrchestrationRun_runKey_key"
  ON "MarketIqEditionOrchestrationRun"("runKey");
CREATE INDEX "MarketIqEditionOrchestrationRun_status_startedAt_idx"
  ON "MarketIqEditionOrchestrationRun"("status", "startedAt" DESC);
CREATE INDEX "MarketIqEditionOrchestrationRun_triggerKind_startedAt_idx"
  ON "MarketIqEditionOrchestrationRun"("triggerKind", "startedAt" DESC);
CREATE UNIQUE INDEX "MarketIqEditionOrchestrationItem_runId_organizationId_marketId_key"
  ON "MarketIqEditionOrchestrationItem"("runId", "organizationId", "marketId");
CREATE INDEX "MarketIqEditionOrchestrationItem_organizationId_createdAt_idx"
  ON "MarketIqEditionOrchestrationItem"("organizationId", "createdAt" DESC);
CREATE INDEX "MarketIqEditionOrchestrationItem_runId_status_idx"
  ON "MarketIqEditionOrchestrationItem"("runId", "status");

ALTER TABLE "MarketIqEditionOrchestrationItem"
  ADD CONSTRAINT "MarketIqEditionOrchestrationItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "MarketIqEditionOrchestrationRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqEditionOrchestrationItem"
  ADD CONSTRAINT "MarketIqEditionOrchestrationItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
