-- Portfolio IQ only: health and outcomes for automated monitoring runs.
CREATE TABLE "PortfolioIqMonitoringRun" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "triggerKind" TEXT NOT NULL DEFAULT 'scheduled',
    "status" TEXT NOT NULL DEFAULT 'running',
    "sourceHealth" TEXT NOT NULL DEFAULT 'unknown',
    "sourceAvailableThrough" TEXT,
    "materialChanges" INTEGER NOT NULL DEFAULT 0,
    "alertsActivated" INTEGER NOT NULL DEFAULT 0,
    "alertsResolved" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioIqMonitoringRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqMonitoringRun_portfolioId_periodKey_key"
ON "PortfolioIqMonitoringRun"("portfolioId", "periodKey");

CREATE INDEX "PortfolioIqMonitoringRun_status_startedAt_idx"
ON "PortfolioIqMonitoringRun"("status", "startedAt" DESC);

CREATE INDEX "PortfolioIqMonitoringRun_portfolioId_startedAt_idx"
ON "PortfolioIqMonitoringRun"("portfolioId", "startedAt" DESC);

ALTER TABLE "PortfolioIqMonitoringRun"
ADD CONSTRAINT "PortfolioIqMonitoringRun_portfolioId_fkey"
FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
