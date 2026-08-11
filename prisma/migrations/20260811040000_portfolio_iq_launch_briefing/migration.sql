-- Additive, owner-specific launch baseline for Portfolio IQ.
-- Operator IQ scorecards, rankings, and customer access paths are untouched.
CREATE TABLE "PortfolioIqLaunchBriefing" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "snapshot" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqLaunchBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqLaunchBriefing_portfolioId_key" ON "PortfolioIqLaunchBriefing"("portfolioId");
CREATE INDEX "PortfolioIqLaunchBriefing_status_updatedAt_idx" ON "PortfolioIqLaunchBriefing"("status", "updatedAt" DESC);

ALTER TABLE "PortfolioIqLaunchBriefing"
  ADD CONSTRAINT "PortfolioIqLaunchBriefing_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
