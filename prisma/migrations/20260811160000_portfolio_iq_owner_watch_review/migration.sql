CREATE TABLE "PortfolioIqOwnerWatchReview" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "reviewedThrough" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortfolioIqOwnerWatchReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqOwnerWatchReview_portfolioId_userId_objectType_objectKey_key"
ON "PortfolioIqOwnerWatchReview"("portfolioId", "userId", "objectType", "objectKey");

CREATE INDEX "PortfolioIqOwnerWatchReview_organizationId_userId_updatedAt_idx"
ON "PortfolioIqOwnerWatchReview"("organizationId", "userId", "updatedAt" DESC);

CREATE INDEX "PortfolioIqOwnerWatchReview_portfolioId_userId_idx"
ON "PortfolioIqOwnerWatchReview"("portfolioId", "userId");

ALTER TABLE "PortfolioIqOwnerWatchReview"
ADD CONSTRAINT "PortfolioIqOwnerWatchReview_portfolioId_fkey"
FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
