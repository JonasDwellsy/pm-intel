CREATE TABLE "MarketIqDailyDeliveryPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'in_app_only',
    "lastDeliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqDailyDeliveryPreference_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketIqDailyWatchlistMatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "propertyManagerName" TEXT,
    "propertyId" TEXT,
    "listingUrl" TEXT,
    "sectionHref" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqDailyWatchlistMatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketIqDailyWatchlistDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "matchCount" INTEGER NOT NULL,
    "eventKeys" TEXT NOT NULL DEFAULT '[]',
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqDailyWatchlistDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketIqDailyDeliveryPreference_organizationId_userId_key" ON "MarketIqDailyDeliveryPreference"("organizationId", "userId");
CREATE INDEX "MarketIqDailyDeliveryPreference_cadence_lastDeliveredAt_idx" ON "MarketIqDailyDeliveryPreference"("cadence", "lastDeliveredAt");
CREATE UNIQUE INDEX "MarketIqDailyWatchlistMatch_watchlistId_eventKey_key" ON "MarketIqDailyWatchlistMatch"("watchlistId", "eventKey");
CREATE INDEX "MarketIqDailyWatchlistMatch_organizationId_userId_createdAt_idx" ON "MarketIqDailyWatchlistMatch"("organizationId", "userId", "createdAt" DESC);
CREATE INDEX "MarketIqDailyWatchlistMatch_organizationId_userId_emailedAt_createdAt_idx" ON "MarketIqDailyWatchlistMatch"("organizationId", "userId", "emailedAt", "createdAt");
CREATE UNIQUE INDEX "MarketIqDailyWatchlistDelivery_deliveryKey_key" ON "MarketIqDailyWatchlistDelivery"("deliveryKey");
CREATE INDEX "MarketIqDailyWatchlistDelivery_organizationId_userId_createdAt_idx" ON "MarketIqDailyWatchlistDelivery"("organizationId", "userId", "createdAt" DESC);
CREATE INDEX "MarketIqDailyWatchlistDelivery_status_createdAt_idx" ON "MarketIqDailyWatchlistDelivery"("status", "createdAt");
ALTER TABLE "MarketIqDailyDeliveryPreference" ADD CONSTRAINT "MarketIqDailyDeliveryPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistMatch" ADD CONSTRAINT "MarketIqDailyWatchlistMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistMatch" ADD CONSTRAINT "MarketIqDailyWatchlistMatch_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "MarketIqDailyWatchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistDelivery" ADD CONSTRAINT "MarketIqDailyWatchlistDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
