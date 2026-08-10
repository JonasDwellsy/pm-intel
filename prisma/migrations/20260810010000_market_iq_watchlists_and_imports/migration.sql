-- Market IQ remains production-inert behind MARKET_IQ_PREVIEW_ENABLED. These
-- tables are additive and are not referenced by any Operator IQ route.
CREATE TABLE "MarketIqWatchlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "geographyType" TEXT NOT NULL DEFAULT 'msa',
    "geographyValues" TEXT NOT NULL DEFAULT '[]',
    "propertyTypes" TEXT NOT NULL DEFAULT '["apartment","house"]',
    "bedroomCounts" TEXT NOT NULL DEFAULT '[]',
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertCadence" TEXT NOT NULL DEFAULT 'weekly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqDataImport" (
    "id" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceFilename" TEXT,
    "sourceChecksum" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "availableThrough" TIMESTAMP(3),
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqDataImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqListing" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "listingStatus" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "askingRent" DOUBLE PRECISION,
    "squareFeet" DOUBLE PRECISION,
    "bedrooms" DOUBLE PRECISION,
    "bathrooms" DOUBLE PRECISION,
    "propertyType" TEXT NOT NULL,
    "communityName" TEXT,
    "ownerName" TEXT,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "rawData" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqDataImport_sourceChecksum_key" ON "MarketIqDataImport"("sourceChecksum");
CREATE INDEX "MarketIqDataImport_marketId_importedAt_idx" ON "MarketIqDataImport"("marketId", "importedAt" DESC);
CREATE UNIQUE INDEX "MarketIqListing_importId_sourceRecordId_key" ON "MarketIqListing"("importId", "sourceRecordId");
CREATE INDEX "MarketIqListing_marketId_activatedAt_idx" ON "MarketIqListing"("marketId", "activatedAt");
CREATE INDEX "MarketIqListing_marketId_city_postalCode_idx" ON "MarketIqListing"("marketId", "city", "postalCode");
CREATE INDEX "MarketIqListing_marketId_propertyType_bedrooms_idx" ON "MarketIqListing"("marketId", "propertyType", "bedrooms");
CREATE INDEX "MarketIqWatchlist_organizationId_updatedAt_idx" ON "MarketIqWatchlist"("organizationId", "updatedAt" DESC);
CREATE INDEX "MarketIqWatchlist_marketId_idx" ON "MarketIqWatchlist"("marketId");

ALTER TABLE "MarketIqWatchlist" ADD CONSTRAINT "MarketIqWatchlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqListing" ADD CONSTRAINT "MarketIqListing_importId_fkey" FOREIGN KEY ("importId") REFERENCES "MarketIqDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
