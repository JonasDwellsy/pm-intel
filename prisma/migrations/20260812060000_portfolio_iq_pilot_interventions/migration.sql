-- Additive pilot customer-success workflow. No Operator IQ tables or access
-- paths are changed.
CREATE TABLE "PortfolioIqPilotSuccessPlan" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "staffOwnerName" TEXT,
  "successGoal" TEXT,
  "nextCheckInAt" TIMESTAMP(3),
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqPilotSuccessPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqPilotIntervention" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "assignedTo" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqPilotIntervention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqPilotSuccessPlan_portfolioId_key" ON "PortfolioIqPilotSuccessPlan"("portfolioId");
CREATE INDEX "PortfolioIqPilotSuccessPlan_organizationId_nextCheckInAt_idx" ON "PortfolioIqPilotSuccessPlan"("organizationId", "nextCheckInAt");
CREATE INDEX "PortfolioIqPilotIntervention_organizationId_status_dueAt_idx" ON "PortfolioIqPilotIntervention"("organizationId", "status", "dueAt");
CREATE INDEX "PortfolioIqPilotIntervention_portfolioId_createdAt_idx" ON "PortfolioIqPilotIntervention"("portfolioId", "createdAt" DESC);

ALTER TABLE "PortfolioIqPilotSuccessPlan"
  ADD CONSTRAINT "PortfolioIqPilotSuccessPlan_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioIqPilotIntervention"
  ADD CONSTRAINT "PortfolioIqPilotIntervention_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
