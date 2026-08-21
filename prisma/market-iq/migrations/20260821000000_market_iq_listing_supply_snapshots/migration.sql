-- Compact daily supply history derived from the existing read-only Market IQ
-- listing feed. This migration changes only the isolated analytical store.

CREATE TABLE "MarketIqListingSupplySnapshot" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "feedRunId" TEXT NOT NULL,
  "sourceAvailableThrough" TIMESTAMP(3) NOT NULL,
  "activeListings" INTEGER NOT NULL,
  "apartmentListings" INTEGER NOT NULL,
  "houseListings" INTEGER NOT NULL,
  "ageObservedListings" INTEGER NOT NULL,
  "medianActiveAgeDays" INTEGER,
  "activeOver30Days" INTEGER NOT NULL,
  "activeOver30SharePct" DOUBLE PRECISION,
  "activatedLast7Days" INTEGER NOT NULL,
  "activatedLast30Days" INTEGER NOT NULL,
  "age0To7Days" INTEGER NOT NULL,
  "age8To14Days" INTEGER NOT NULL,
  "age15To30Days" INTEGER NOT NULL,
  "age31To60Days" INTEGER NOT NULL,
  "age61PlusDays" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqListingSupplySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqListingSupplySnapshot_feedRunId_key"
  ON "MarketIqListingSupplySnapshot"("feedRunId");
CREATE UNIQUE INDEX "MarketIqListingSupplySnapshot_marketId_snapshotDate_key"
  ON "MarketIqListingSupplySnapshot"("marketId", "snapshotDate");
CREATE INDEX "MarketIqListingSupplySnapshot_marketId_snapshotDate_idx"
  ON "MarketIqListingSupplySnapshot"("marketId", "snapshotDate" DESC);

ALTER TABLE "MarketIqListingSupplySnapshot"
  ADD CONSTRAINT "MarketIqListingSupplySnapshot_feedRunId_fkey"
  FOREIGN KEY ("feedRunId") REFERENCES "MarketIqListingFeedRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
