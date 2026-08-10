-- Additive, Market IQ-only storage for authoritative Dwellsy IQ trend points.
-- No Operator IQ route reads this table.
CREATE TABLE "MarketIqTrendObservation" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "geographyType" TEXT NOT NULL,
    "geographyValue" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "propertyType" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "observations" INTEGER NOT NULL,
    "askingRent" DOUBLE PRECISION NOT NULL,
    "yearOverYearPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqTrendObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqTrendObservation_importId_geographyType_geographyValue_month_propertyType_bedrooms_key"
ON "MarketIqTrendObservation"("importId", "geographyType", "geographyValue", "month", "propertyType", "bedrooms");
CREATE INDEX "MarketIqTrendObservation_marketId_geographyType_geographyValue_month_idx"
ON "MarketIqTrendObservation"("marketId", "geographyType", "geographyValue", "month");
CREATE INDEX "MarketIqTrendObservation_marketId_propertyType_bedrooms_month_idx"
ON "MarketIqTrendObservation"("marketId", "propertyType", "bedrooms", "month");

ALTER TABLE "MarketIqTrendObservation"
ADD CONSTRAINT "MarketIqTrendObservation_importId_fkey"
FOREIGN KEY ("importId") REFERENCES "MarketIqDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
