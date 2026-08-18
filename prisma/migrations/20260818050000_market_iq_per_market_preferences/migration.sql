CREATE TABLE "MarketIqMarketPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "cities" TEXT NOT NULL DEFAULT '[]',
    "zipCodes" TEXT NOT NULL DEFAULT '[]',
    "segments" TEXT NOT NULL DEFAULT '[]',
    "configuredAt" TIMESTAMP(3),
    "recurringEditionsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringEnabledAt" TIMESTAMP(3),
    "recurringEnabledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqMarketPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqMarketPreference_organizationId_marketId_key"
ON "MarketIqMarketPreference"("organizationId", "marketId");

CREATE INDEX "MarketIqMarketPreference_marketId_idx"
ON "MarketIqMarketPreference"("marketId");

CREATE INDEX "MarketIqMarketPreference_organizationId_recurringEditionsEnabled_idx"
ON "MarketIqMarketPreference"("organizationId", "recurringEditionsEnabled");

ALTER TABLE "MarketIqMarketPreference"
ADD CONSTRAINT "MarketIqMarketPreference_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MarketIqMarketPreference" (
    "id",
    "organizationId",
    "marketId",
    "cities",
    "zipCodes",
    "segments",
    "configuredAt",
    "recurringEditionsEnabled",
    "recurringEnabledAt",
    "recurringEnabledByUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    'miqmp_' || "id",
    "organizationId",
    "defaultMarketId",
    "defaultCities",
    "defaultZipCodes",
    "defaultSegments",
    "onboardingCompletedAt",
    "recurringEditionsEnabled",
    "recurringEnabledAt",
    "recurringEnabledByUserId",
    "createdAt",
    "updatedAt"
FROM "MarketIqWorkspacePreference"
ON CONFLICT ("organizationId", "marketId") DO NOTHING;
