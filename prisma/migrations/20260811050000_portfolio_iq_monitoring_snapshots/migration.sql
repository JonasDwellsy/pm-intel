-- Portfolio IQ only: immutable launch and weekly monitoring snapshots.
CREATE TABLE "PortfolioIqMonitoringSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "sourceAvailableThrough" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioIqMonitoringSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqMonitoringSnapshot_portfolioId_periodKey_key"
ON "PortfolioIqMonitoringSnapshot"("portfolioId", "periodKey");

CREATE INDEX "PortfolioIqMonitoringSnapshot_portfolioId_capturedAt_idx"
ON "PortfolioIqMonitoringSnapshot"("portfolioId", "capturedAt" DESC);

ALTER TABLE "PortfolioIqMonitoringSnapshot"
ADD CONSTRAINT "PortfolioIqMonitoringSnapshot_portfolioId_fkey"
FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
