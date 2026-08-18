-- Additive Market IQ report-source snapshots. Dwellsy production remains
-- read-only; this table stores dated, immutable report evidence only in the
-- isolated Market IQ analytical database.

CREATE TABLE "MarketIqReportSourceSnapshot" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL DEFAULT 'dwellsy_trends',
  "sourceAvailableThrough" TIMESTAMP(3) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "snapshot" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqReportSourceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqReportSourceSnapshot_marketId_checksum_key"
  ON "MarketIqReportSourceSnapshot"("marketId", "checksum");

CREATE INDEX "MarketIqReportSourceSnapshot_marketId_generatedAt_idx"
  ON "MarketIqReportSourceSnapshot"("marketId", "generatedAt" DESC);
