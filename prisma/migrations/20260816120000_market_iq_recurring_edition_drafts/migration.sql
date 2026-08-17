-- Private recurring-edition drafts. This migration is additive and does not
-- alter Operator IQ or Portfolio IQ access paths.
ALTER TABLE "MarketIqReport"
  ADD COLUMN "editionDraftId" TEXT;

CREATE UNIQUE INDEX "MarketIqReport_editionDraftId_key"
  ON "MarketIqReport"("editionDraftId");

CREATE TABLE "MarketIqEditionDraft" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "periodEnd" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "sourceKind" TEXT NOT NULL,
  "sourceAvailableThrough" TEXT NOT NULL,
  "scopeFingerprint" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "comparison" TEXT NOT NULL,
  "materialChangeCount" INTEGER NOT NULL DEFAULT 0,
  "generatedBy" TEXT NOT NULL DEFAULT 'recurring-edition-engine',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "publishedReportId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqEditionDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqEditionDraft_organizationId_marketId_periodEnd_key"
  ON "MarketIqEditionDraft"("organizationId", "marketId", "periodEnd");
CREATE INDEX "MarketIqEditionDraft_organizationId_status_detectedAt_idx"
  ON "MarketIqEditionDraft"("organizationId", "status", "detectedAt" DESC);
CREATE INDEX "MarketIqEditionDraft_marketId_periodEnd_idx"
  ON "MarketIqEditionDraft"("marketId", "periodEnd");

ALTER TABLE "MarketIqEditionDraft"
  ADD CONSTRAINT "MarketIqEditionDraft_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
