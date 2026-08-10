-- Additive Market IQ-only alert storage. Operator IQ does not query this table.
CREATE TABLE "MarketIqAlert" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "sourceImportId" TEXT NOT NULL,
    "geographyType" TEXT NOT NULL,
    "geographyValue" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "observedMonth" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqAlert_fingerprint_key" ON "MarketIqAlert"("fingerprint");
CREATE INDEX "MarketIqAlert_marketId_geographyType_geographyValue_observedMonth_idx"
ON "MarketIqAlert"("marketId", "geographyType", "geographyValue", "observedMonth" DESC);
CREATE INDEX "MarketIqAlert_sourceImportId_idx" ON "MarketIqAlert"("sourceImportId");
