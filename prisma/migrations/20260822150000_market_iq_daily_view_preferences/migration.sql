-- Additive, user-level Daily Edition explorer preferences. These do not alter
-- organization market scope or recurring-report configuration.
CREATE TABLE "MarketIqDailyViewPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqDailyViewPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqDailyViewPreference_organizationId_userId_marketId_key" ON "MarketIqDailyViewPreference"("organizationId", "userId", "marketId");
CREATE INDEX "MarketIqDailyViewPreference_organizationId_marketId_idx" ON "MarketIqDailyViewPreference"("organizationId", "marketId");

ALTER TABLE "MarketIqDailyViewPreference" ADD CONSTRAINT "MarketIqDailyViewPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
