-- Additive Portfolio IQ assisted-onboarding layer. No existing Operator IQ
-- table, route, or entitlement is modified by this migration.
CREATE TABLE "PortfolioIqPortfolio" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activating',
    "onboardingMode" TEXT NOT NULL DEFAULT 'assisted',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqPortfolio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqAsset" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "suppliedAddress" TEXT NOT NULL,
    "canonicalAddress" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "unitCount" INTEGER,
    "dwellsyCommunityId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'needs_review',
    "matchConfidence" DOUBLE PRECISION,
    "readinessStatus" TEXT NOT NULL DEFAULT 'needs_confirmation',
    "uruStatus" TEXT NOT NULL DEFAULT 'unknown',
    "compSetStatus" TEXT NOT NULL DEFAULT 'not_started',
    "observedOperatorName" TEXT,
    "operatorRelationshipStatus" TEXT NOT NULL DEFAULT 'observed',
    "sourceNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqBuilding" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT,
    "suppliedAddress" TEXT NOT NULL,
    "canonicalAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "dwellsyCommunityId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqBuilding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqOperatorAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "canonicalOperatorId" TEXT,
    "observedOperatorName" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'dwellsy_observation',
    "verificationStatus" TEXT NOT NULL DEFAULT 'observed',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqOperatorAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqActivationTask" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedLane" TEXT NOT NULL DEFAULT 'activation_ops',
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqActivationTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqPortfolio_organizationId_slug_key" ON "PortfolioIqPortfolio"("organizationId", "slug");
CREATE INDEX "PortfolioIqPortfolio_organizationId_updatedAt_idx" ON "PortfolioIqPortfolio"("organizationId", "updatedAt" DESC);
CREATE INDEX "PortfolioIqPortfolio_marketId_idx" ON "PortfolioIqPortfolio"("marketId");
CREATE UNIQUE INDEX "PortfolioIqAsset_portfolioId_slug_key" ON "PortfolioIqAsset"("portfolioId", "slug");
CREATE INDEX "PortfolioIqAsset_portfolioId_sortOrder_idx" ON "PortfolioIqAsset"("portfolioId", "sortOrder");
CREATE INDEX "PortfolioIqAsset_dwellsyCommunityId_idx" ON "PortfolioIqAsset"("dwellsyCommunityId");
CREATE UNIQUE INDEX "PortfolioIqBuilding_assetId_canonicalAddress_key" ON "PortfolioIqBuilding"("assetId", "canonicalAddress");
CREATE INDEX "PortfolioIqBuilding_assetId_idx" ON "PortfolioIqBuilding"("assetId");
CREATE INDEX "PortfolioIqOperatorAssignment_assetId_isCurrent_idx" ON "PortfolioIqOperatorAssignment"("assetId", "isCurrent");
CREATE INDEX "PortfolioIqOperatorAssignment_canonicalOperatorId_idx" ON "PortfolioIqOperatorAssignment"("canonicalOperatorId");
CREATE UNIQUE INDEX "PortfolioIqActivationTask_assetId_taskType_key" ON "PortfolioIqActivationTask"("assetId", "taskType");
CREATE INDEX "PortfolioIqActivationTask_status_assignedLane_idx" ON "PortfolioIqActivationTask"("status", "assignedLane");
CREATE INDEX "PortfolioIqActivationTask_assetId_idx" ON "PortfolioIqActivationTask"("assetId");

ALTER TABLE "PortfolioIqPortfolio" ADD CONSTRAINT "PortfolioIqPortfolio_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqAsset" ADD CONSTRAINT "PortfolioIqAsset_portfolioId_fkey"
FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqBuilding" ADD CONSTRAINT "PortfolioIqBuilding_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqOperatorAssignment" ADD CONSTRAINT "PortfolioIqOperatorAssignment_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqOperatorAssignment" ADD CONSTRAINT "PortfolioIqOperatorAssignment_canonicalOperatorId_fkey"
FOREIGN KEY ("canonicalOperatorId") REFERENCES "CanonicalOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqActivationTask" ADD CONSTRAINT "PortfolioIqActivationTask_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
