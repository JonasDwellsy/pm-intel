-- Dedicated Market IQ analytical store. All statements are idempotent so this
-- baseline can be applied to the already-provisioned standalone database as
-- well as to a fresh Neon database.

CREATE TABLE IF NOT EXISTS "MarketIqDataImport" (
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

CREATE TABLE IF NOT EXISTS "MarketIqListing" (
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

CREATE TABLE IF NOT EXISTS "MarketIqTrendObservation" (
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

CREATE TABLE IF NOT EXISTS "MarketIqAlert" (
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

CREATE TABLE IF NOT EXISTS "MarketIqSourceRefresh" (
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

CREATE TABLE IF NOT EXISTS "MarketIqSourceRefreshItem" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "MarketIqDataImport_sourceChecksum_key" ON "MarketIqDataImport"("sourceChecksum");
CREATE INDEX IF NOT EXISTS "MarketIqDataImport_marketId_importedAt_idx" ON "MarketIqDataImport"("marketId", "importedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketIqListing_importId_sourceRecordId_key" ON "MarketIqListing"("importId", "sourceRecordId");
CREATE INDEX IF NOT EXISTS "MarketIqListing_marketId_activatedAt_idx" ON "MarketIqListing"("marketId", "activatedAt");
CREATE INDEX IF NOT EXISTS "MarketIqListing_marketId_city_postalCode_idx" ON "MarketIqListing"("marketId", "city", "postalCode");
CREATE INDEX IF NOT EXISTS "MarketIqListing_marketId_propertyType_bedrooms_idx" ON "MarketIqListing"("marketId", "propertyType", "bedrooms");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketIqTrendObservation_importId_geographyType_geographyValue_month_propertyType_bedrooms_key" ON "MarketIqTrendObservation"("importId", "geographyType", "geographyValue", "month", "propertyType", "bedrooms");
CREATE INDEX IF NOT EXISTS "MarketIqTrendObservation_marketId_geographyType_geographyValue_month_idx" ON "MarketIqTrendObservation"("marketId", "geographyType", "geographyValue", "month");
CREATE INDEX IF NOT EXISTS "MarketIqTrendObservation_marketId_propertyType_bedrooms_month_idx" ON "MarketIqTrendObservation"("marketId", "propertyType", "bedrooms", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketIqAlert_fingerprint_key" ON "MarketIqAlert"("fingerprint");
CREATE INDEX IF NOT EXISTS "MarketIqAlert_marketId_geographyType_geographyValue_observedMonth_idx" ON "MarketIqAlert"("marketId", "geographyType", "geographyValue", "observedMonth" DESC);
CREATE INDEX IF NOT EXISTS "MarketIqAlert_sourceImportId_idx" ON "MarketIqAlert"("sourceImportId");
CREATE INDEX IF NOT EXISTS "MarketIqSourceRefresh_marketId_startedAt_idx" ON "MarketIqSourceRefresh"("marketId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "MarketIqSourceRefresh_status_startedAt_idx" ON "MarketIqSourceRefresh"("status", "startedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketIqSourceRefreshItem_refreshId_geographyType_geographyValue_key" ON "MarketIqSourceRefreshItem"("refreshId", "geographyType", "geographyValue");
CREATE INDEX IF NOT EXISTS "MarketIqSourceRefreshItem_refreshId_status_idx" ON "MarketIqSourceRefreshItem"("refreshId", "status");
CREATE INDEX IF NOT EXISTS "MarketIqSourceRefreshItem_geographyType_geographyValue_receivedAt_idx" ON "MarketIqSourceRefreshItem"("geographyType", "geographyValue", "receivedAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketIqListing_importId_fkey') THEN
    ALTER TABLE "MarketIqListing" ADD CONSTRAINT "MarketIqListing_importId_fkey" FOREIGN KEY ("importId") REFERENCES "MarketIqDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketIqTrendObservation_importId_fkey') THEN
    ALTER TABLE "MarketIqTrendObservation" ADD CONSTRAINT "MarketIqTrendObservation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "MarketIqDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketIqSourceRefreshItem_refreshId_fkey') THEN
    ALTER TABLE "MarketIqSourceRefreshItem" ADD CONSTRAINT "MarketIqSourceRefreshItem_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "MarketIqSourceRefresh"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
