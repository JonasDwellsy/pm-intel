-- Additive Market IQ live-listing feed. Dwellsy production remains read-only;
-- these tables store normalized snapshots and derived events only in the
-- dedicated Market IQ analytical database.

CREATE TABLE "MarketIqListingFeedRun" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL DEFAULT 'dwellsy_production',
  "triggerKind" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'loading',
  "sourceAvailableThrough" TIMESTAMP(3),
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "apartmentCount" INTEGER NOT NULL DEFAULT 0,
  "houseCount" INTEGER NOT NULL DEFAULT 0,
  "newCount" INTEGER NOT NULL DEFAULT 0,
  "relistedCount" INTEGER NOT NULL DEFAULT 0,
  "reactivatedCount" INTEGER NOT NULL DEFAULT 0,
  "priceChangeCount" INTEGER NOT NULL DEFAULT 0,
  "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedBy" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqListingFeedRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqLiveListingSnapshot" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "sourceListingId" TEXT NOT NULL,
  "sourcePropertyId" TEXT NOT NULL,
  "sourceParentPropertyId" TEXT,
  "sourceCompanyId" TEXT,
  "operatorNameSlug" TEXT,
  "communityId" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "askingRent" DOUBLE PRECISION NOT NULL,
  "squareFeet" DOUBLE PRECISION,
  "bedrooms" DOUBLE PRECISION NOT NULL,
  "bathrooms" DOUBLE PRECISION,
  "propertyType" TEXT NOT NULL,
  "listingCreatedAt" TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketIqLiveListingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqListingEvent" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceListingId" TEXT NOT NULL,
  "sourcePropertyId" TEXT NOT NULL,
  "propertyType" TEXT NOT NULL,
  "city" TEXT,
  "postalCode" TEXT,
  "previousRent" DOUBLE PRECISION,
  "currentRent" DOUBLE PRECISION,
  "sourceOccurredAt" TIMESTAMP(3),
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "MarketIqListingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketIqListingFeedRun_marketId_completedAt_idx" ON "MarketIqListingFeedRun"("marketId", "completedAt" DESC);
CREATE INDEX "MarketIqListingFeedRun_status_startedAt_idx" ON "MarketIqListingFeedRun"("status", "startedAt" DESC);
CREATE UNIQUE INDEX "MarketIqLiveListingSnapshot_runId_sourceListingId_key" ON "MarketIqLiveListingSnapshot"("runId", "sourceListingId");
CREATE INDEX "MarketIqLiveListingSnapshot_marketId_propertyType_bedrooms_idx" ON "MarketIqLiveListingSnapshot"("marketId", "propertyType", "bedrooms");
CREATE INDEX "MarketIqLiveListingSnapshot_marketId_city_postalCode_idx" ON "MarketIqLiveListingSnapshot"("marketId", "city", "postalCode");
CREATE INDEX "MarketIqLiveListingSnapshot_sourceListingId_capturedAt_idx" ON "MarketIqLiveListingSnapshot"("sourceListingId", "capturedAt" DESC);
CREATE INDEX "MarketIqLiveListingSnapshot_sourcePropertyId_capturedAt_idx" ON "MarketIqLiveListingSnapshot"("sourcePropertyId", "capturedAt" DESC);
CREATE UNIQUE INDEX "MarketIqListingEvent_fingerprint_key" ON "MarketIqListingEvent"("fingerprint");
CREATE INDEX "MarketIqListingEvent_marketId_eventType_observedAt_idx" ON "MarketIqListingEvent"("marketId", "eventType", "observedAt" DESC);
CREATE INDEX "MarketIqListingEvent_sourceListingId_observedAt_idx" ON "MarketIqListingEvent"("sourceListingId", "observedAt" DESC);
CREATE INDEX "MarketIqListingEvent_sourcePropertyId_observedAt_idx" ON "MarketIqListingEvent"("sourcePropertyId", "observedAt" DESC);

ALTER TABLE "MarketIqLiveListingSnapshot"
  ADD CONSTRAINT "MarketIqLiveListingSnapshot_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "MarketIqListingFeedRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketIqListingEvent"
  ADD CONSTRAINT "MarketIqListingEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "MarketIqListingFeedRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
