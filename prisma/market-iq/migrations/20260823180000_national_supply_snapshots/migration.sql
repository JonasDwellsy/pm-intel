-- Precompute daily supply history for every covered Dwellsy MSA before a
-- customer selects it. This migration changes only the isolated Market IQ
-- analytical store and does not alter the read-only Dwellsy source.

CREATE TABLE "MarketIqNationalSupplySnapshot" (
  "id" TEXT NOT NULL,
  "cbsaCode" TEXT NOT NULL,
  "marketName" TEXT NOT NULL,
  "stateCodes" TEXT NOT NULL DEFAULT '[]',
  "timeZone" TEXT,
  "snapshotDate" DATE NOT NULL,
  "coverageStatus" TEXT NOT NULL,
  "sourceAvailableThrough" TIMESTAMP(3),
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
  CONSTRAINT "MarketIqNationalSupplySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqNationalSupplySnapshot_cbsaCode_snapshotDate_key"
  ON "MarketIqNationalSupplySnapshot"("cbsaCode", "snapshotDate");
CREATE INDEX "MarketIqNationalSupplySnapshot_cbsaCode_snapshotDate_idx"
  ON "MarketIqNationalSupplySnapshot"("cbsaCode", "snapshotDate" DESC);
CREATE INDEX "MarketIqNationalSupplySnapshot_coverageStatus_snapshotDate_idx"
  ON "MarketIqNationalSupplySnapshot"("coverageStatus", "snapshotDate" DESC);
