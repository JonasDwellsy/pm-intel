-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "msaCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "operatorCountTotal" INTEGER NOT NULL,
    "operatorCountEligible" INTEGER NOT NULL,
    "medianDomT12" REAL NOT NULL,
    "medianDomLifetime" REAL NOT NULL,
    "quadrantSummary" TEXT NOT NULL,
    "quadrant7CellSummary" TEXT,
    "activeOperatorCount" INTEGER,
    "activeOperatorCountBySubmarket" TEXT,
    "marketRentGrowthT12" REAL,
    "nationalRentGrowthT12" REAL,
    "marketRentGrowthDeltaVsNationalPp" REAL,
    "eligibilityWindow" TEXT DEFAULT 'T12',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PM" (
    "slug" TEXT NOT NULL PRIMARY KEY,
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
    "dataAsOf" DATETIME NOT NULL,
    "t12ListingsBySubmarket" TEXT,
    "newlyEligibleInV063" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PM_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pmSlug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "domainVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
