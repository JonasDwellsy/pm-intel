-- Additive pilot-acceptance records for the isolated Portfolio IQ owner flow.
-- No Operator IQ tables, scorecards, or customer entitlements are changed.
CREATE TABLE "PortfolioIqPilotAcceptance" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "sessionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "acceptedBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqPilotAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqPilotReview" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "note" TEXT,
  "reviewedBy" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqPilotReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqPilotCorrection" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assetId" TEXT,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "issue" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assignedLane" TEXT NOT NULL DEFAULT 'customer_success',
  "createdBy" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqPilotCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqPilotAcceptance_portfolioId_key" ON "PortfolioIqPilotAcceptance"("portfolioId");
CREATE INDEX "PortfolioIqPilotAcceptance_organizationId_status_updatedAt_idx" ON "PortfolioIqPilotAcceptance"("organizationId", "status", "updatedAt" DESC);
CREATE UNIQUE INDEX "PortfolioIqPilotReview_portfolioId_objectType_objectId_key" ON "PortfolioIqPilotReview"("portfolioId", "objectType", "objectId");
CREATE INDEX "PortfolioIqPilotReview_organizationId_reviewedAt_idx" ON "PortfolioIqPilotReview"("organizationId", "reviewedAt" DESC);
CREATE INDEX "PortfolioIqPilotReview_portfolioId_objectType_idx" ON "PortfolioIqPilotReview"("portfolioId", "objectType");
CREATE UNIQUE INDEX "PortfolioIqPilotCorrection_portfolioId_objectType_objectId_key" ON "PortfolioIqPilotCorrection"("portfolioId", "objectType", "objectId");
CREATE INDEX "PortfolioIqPilotCorrection_organizationId_status_updatedAt_idx" ON "PortfolioIqPilotCorrection"("organizationId", "status", "updatedAt" DESC);
CREATE INDEX "PortfolioIqPilotCorrection_portfolioId_status_idx" ON "PortfolioIqPilotCorrection"("portfolioId", "status");
CREATE INDEX "PortfolioIqPilotCorrection_assetId_idx" ON "PortfolioIqPilotCorrection"("assetId");

ALTER TABLE "PortfolioIqPilotAcceptance" ADD CONSTRAINT "PortfolioIqPilotAcceptance_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqPilotReview" ADD CONSTRAINT "PortfolioIqPilotReview_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqPilotCorrection" ADD CONSTRAINT "PortfolioIqPilotCorrection_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
