CREATE TABLE "MarketIqMarketSummary" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'dwellsy_trends',
    "sourceAvailableThrough" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqMarketSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqMarketSummary_marketId_key" ON "MarketIqMarketSummary"("marketId");
CREATE INDEX "MarketIqMarketSummary_sourceAvailableThrough_idx" ON "MarketIqMarketSummary"("sourceAvailableThrough" DESC);
