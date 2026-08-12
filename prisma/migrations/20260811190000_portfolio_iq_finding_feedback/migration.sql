-- Owner-specific feedback on Portfolio IQ findings. This table is additive
-- and does not change Operator IQ scorecards, rankings, or customer routes.
CREATE TABLE "PortfolioIqFindingFeedback" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "note" TEXT,
    "suppressFromQueue" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioIqFindingFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqFindingFeedback_portfolioId_userId_signalId_key" ON "PortfolioIqFindingFeedback"("portfolioId", "userId", "signalId");
CREATE INDEX "PortfolioIqFindingFeedback_organizationId_rating_reviewedAt_idx" ON "PortfolioIqFindingFeedback"("organizationId", "rating", "reviewedAt" DESC);
CREATE INDEX "PortfolioIqFindingFeedback_portfolioId_rating_idx" ON "PortfolioIqFindingFeedback"("portfolioId", "rating");
CREATE INDEX "PortfolioIqFindingFeedback_userId_suppressFromQueue_idx" ON "PortfolioIqFindingFeedback"("userId", "suppressFromQueue");

ALTER TABLE "PortfolioIqFindingFeedback" ADD CONSTRAINT "PortfolioIqFindingFeedback_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqFindingFeedback" ADD CONSTRAINT "PortfolioIqFindingFeedback_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "PortfolioIqSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
