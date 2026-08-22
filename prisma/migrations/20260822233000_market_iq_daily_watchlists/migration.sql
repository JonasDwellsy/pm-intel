-- Additive, personal Daily Edition watchlists. These rows do not change shared
-- market snapshots, organization report scope, or the legacy monthly watchlist.
CREATE TABLE "MarketIqDailyWatchlist" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqDailyWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqDailyWatchlist_organizationId_userId_marketId_name_key" ON "MarketIqDailyWatchlist"("organizationId", "userId", "marketId", "name");
CREATE INDEX "MarketIqDailyWatchlist_organizationId_userId_marketId_updatedAt_idx" ON "MarketIqDailyWatchlist"("organizationId", "userId", "marketId", "updatedAt" DESC);

ALTER TABLE "MarketIqDailyWatchlist" ADD CONSTRAINT "MarketIqDailyWatchlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
