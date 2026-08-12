-- Minimal workspace-view evidence for pilot success operations.
CREATE TABLE "PortfolioIqPilotEngagement" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "lastRoute" TEXT NOT NULL DEFAULT '/today',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqPilotEngagement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqPilotEngagement_portfolioId_userId_key" ON "PortfolioIqPilotEngagement"("portfolioId", "userId");
CREATE INDEX "PortfolioIqPilotEngagement_organizationId_lastViewedAt_idx" ON "PortfolioIqPilotEngagement"("organizationId", "lastViewedAt" DESC);
CREATE INDEX "PortfolioIqPilotEngagement_portfolioId_lastViewedAt_idx" ON "PortfolioIqPilotEngagement"("portfolioId", "lastViewedAt" DESC);
ALTER TABLE "PortfolioIqPilotEngagement" ADD CONSTRAINT "PortfolioIqPilotEngagement_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
