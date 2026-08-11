-- Additive orchestration state for Market IQ source refreshes. Upstream MCPs
-- may remain unavailable; an awaiting-source run records that fact honestly.
CREATE TABLE "MarketIqSourceRefresh" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL DEFAULT 'trends',
  "triggerKind" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'awaiting_source',
  "requiredManifest" TEXT NOT NULL,
  "sourceAvailableThrough" TIMESTAMP(3),
  "receivedGeographies" INTEGER NOT NULL DEFAULT 0,
  "requiredGeographies" INTEGER NOT NULL,
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedBy" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqSourceRefresh_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqSourceRefreshItem" (
  "id" TEXT NOT NULL,
  "refreshId" TEXT NOT NULL,
  "geographyType" TEXT NOT NULL,
  "geographyValue" TEXT NOT NULL,
  "requiredSegments" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'awaiting_source',
  "importId" TEXT,
  "sourceAvailableThrough" TIMESTAMP(3),
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "reportableSegments" INTEGER NOT NULL DEFAULT 0,
  "validation" TEXT NOT NULL DEFAULT '{}',
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqSourceRefreshItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketIqSourceRefresh_marketId_startedAt_idx" ON "MarketIqSourceRefresh"("marketId", "startedAt" DESC);
CREATE INDEX "MarketIqSourceRefresh_status_startedAt_idx" ON "MarketIqSourceRefresh"("status", "startedAt" DESC);
CREATE UNIQUE INDEX "MarketIqSourceRefreshItem_refreshId_geographyType_geographyValue_key" ON "MarketIqSourceRefreshItem"("refreshId", "geographyType", "geographyValue");
CREATE INDEX "MarketIqSourceRefreshItem_refreshId_status_idx" ON "MarketIqSourceRefreshItem"("refreshId", "status");
CREATE INDEX "MarketIqSourceRefreshItem_geographyType_geographyValue_receivedAt_idx" ON "MarketIqSourceRefreshItem"("geographyType", "geographyValue", "receivedAt" DESC);

ALTER TABLE "MarketIqSourceRefreshItem" ADD CONSTRAINT "MarketIqSourceRefreshItem_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "MarketIqSourceRefresh"("id") ON DELETE CASCADE ON UPDATE CASCADE;
