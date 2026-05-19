-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "msaCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "operatorCountTotal" INTEGER NOT NULL,
    "operatorCountEligible" INTEGER NOT NULL,
    "medianDomT12" DOUBLE PRECISION NOT NULL,
    "medianDomLifetime" DOUBLE PRECISION NOT NULL,
    "quadrantSummary" TEXT NOT NULL,
    "quadrant7CellSummary" TEXT,
    "activeOperatorCount" INTEGER,
    "activeOperatorCountBySubmarket" TEXT,
    "marketRentGrowthT12" DOUBLE PRECISION,
    "nationalRentGrowthT12" DOUBLE PRECISION,
    "marketRentGrowthDeltaVsNationalPp" DOUBLE PRECISION,
    "eligibilityWindow" TEXT DEFAULT 'T12',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PM" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "quadrant7Cell" TEXT,
    "hybrid" BOOLEAN NOT NULL DEFAULT false,
    "rankOverall" INTEGER,
    "rankOverallTotal" INTEGER,
    "rankQuadrant" INTEGER,
    "rankQuadrantTotal" INTEGER,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "scorecardData" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "t12ListingsBySubmarket" TEXT,
    "newlyEligibleInV063" BOOLEAN DEFAULT false,
    "canonicalOperatorId" TEXT,
    "canonicalOperatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PM_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "CanonicalOperator" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "marketIds" TEXT NOT NULL,
    "pmSlugs" TEXT NOT NULL,
    "marketCount" INTEGER NOT NULL,
    "aggregateStats" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonicalOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "marketId" TEXT,
    "propertyType" TEXT NOT NULL,
    "unitCount" INTEGER,
    "preferredQuadrant" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerPhone" TEXT,
    "notes" TEXT,
    "matchedPms" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "domainVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalOperator_canonicalSlug_key" ON "CanonicalOperator"("canonicalSlug");

-- AddForeignKey
ALTER TABLE "PM" ADD CONSTRAINT "PM_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
