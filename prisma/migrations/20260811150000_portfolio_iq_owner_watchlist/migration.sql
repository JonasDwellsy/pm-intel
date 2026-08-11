CREATE TABLE "PortfolioIqOwnerWatchItem" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "pinnedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortfolioIqOwnerWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqOwnerWatchItem_portfolioId_objectType_objectKey_key"
ON "PortfolioIqOwnerWatchItem"("portfolioId", "objectType", "objectKey");

CREATE INDEX "PortfolioIqOwnerWatchItem_organizationId_updatedAt_idx"
ON "PortfolioIqOwnerWatchItem"("organizationId", "updatedAt" DESC);

CREATE INDEX "PortfolioIqOwnerWatchItem_portfolioId_objectType_idx"
ON "PortfolioIqOwnerWatchItem"("portfolioId", "objectType");

ALTER TABLE "PortfolioIqOwnerWatchItem"
ADD CONSTRAINT "PortfolioIqOwnerWatchItem_portfolioId_fkey"
FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
