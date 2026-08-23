ALTER TABLE "MarketIqDailyWatchlist" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

DROP INDEX "MarketIqDailyWatchlistMatch_watchlistId_eventKey_key";
CREATE UNIQUE INDEX "MarketIqDailyWatchlistMatch_watchlistId_userId_eventKey_key" ON "MarketIqDailyWatchlistMatch"("watchlistId", "userId", "eventKey");

CREATE TABLE "MarketIqDailyWatchlistSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqDailyWatchlistSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqDailyWatchlistTriage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedToUserId" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqDailyWatchlistTriage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqDailyWatchlistNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "triageId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIqDailyWatchlistNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqDailyWatchlistSubscription_watchlistId_userId_key" ON "MarketIqDailyWatchlistSubscription"("watchlistId", "userId");
CREATE INDEX "MarketIqDailyWatchlistSubscription_organizationId_userId_createdAt_idx" ON "MarketIqDailyWatchlistSubscription"("organizationId", "userId", "createdAt" DESC);
CREATE UNIQUE INDEX "MarketIqDailyWatchlistTriage_watchlistId_eventKey_key" ON "MarketIqDailyWatchlistTriage"("watchlistId", "eventKey");
CREATE INDEX "MarketIqDailyWatchlistTriage_organizationId_status_updatedAt_idx" ON "MarketIqDailyWatchlistTriage"("organizationId", "status", "updatedAt" DESC);
CREATE INDEX "MarketIqDailyWatchlistTriage_organizationId_assignedToUserId_updatedAt_idx" ON "MarketIqDailyWatchlistTriage"("organizationId", "assignedToUserId", "updatedAt" DESC);
CREATE INDEX "MarketIqDailyWatchlistNote_triageId_createdAt_idx" ON "MarketIqDailyWatchlistNote"("triageId", "createdAt" DESC);
CREATE INDEX "MarketIqDailyWatchlistNote_organizationId_authorUserId_createdAt_idx" ON "MarketIqDailyWatchlistNote"("organizationId", "authorUserId", "createdAt" DESC);

ALTER TABLE "MarketIqDailyWatchlistSubscription" ADD CONSTRAINT "MarketIqDailyWatchlistSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistSubscription" ADD CONSTRAINT "MarketIqDailyWatchlistSubscription_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "MarketIqDailyWatchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistTriage" ADD CONSTRAINT "MarketIqDailyWatchlistTriage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistTriage" ADD CONSTRAINT "MarketIqDailyWatchlistTriage_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "MarketIqDailyWatchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistNote" ADD CONSTRAINT "MarketIqDailyWatchlistNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistNote" ADD CONSTRAINT "MarketIqDailyWatchlistNote_triageId_fkey" FOREIGN KEY ("triageId") REFERENCES "MarketIqDailyWatchlistTriage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
