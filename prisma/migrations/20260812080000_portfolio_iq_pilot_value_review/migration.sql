-- Frozen Portfolio IQ pilot value reviews. This is additive and does not
-- modify Operator IQ models, scorecards, or customer access.
CREATE TABLE "PortfolioIqPilotValueReview" (
  "id" TEXT NOT NULL,
  "reviewKey" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "snapshot" TEXT NOT NULL,
  "finalizedBy" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioIqPilotValueReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortfolioIqPilotValueReview_reviewKey_key" ON "PortfolioIqPilotValueReview"("reviewKey");
CREATE INDEX "PortfolioIqPilotValueReview_organizationId_finalizedAt_idx" ON "PortfolioIqPilotValueReview"("organizationId", "finalizedAt" DESC);
CREATE INDEX "PortfolioIqPilotValueReview_portfolioId_periodEnd_idx" ON "PortfolioIqPilotValueReview"("portfolioId", "periodEnd" DESC);
ALTER TABLE "PortfolioIqPilotValueReview" ADD CONSTRAINT "PortfolioIqPilotValueReview_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
