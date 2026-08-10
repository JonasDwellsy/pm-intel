-- Additive owner decision state and audit history for Portfolio Watch.
-- The source signal is preserved; owner workflow lives in separate tables.
CREATE TABLE "PortfolioIqSignalDecision" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "note" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqSignalDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqSignalDecisionEvent" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "assignedTo" TEXT,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqSignalDecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqSignalDecision_signalId_key" ON "PortfolioIqSignalDecision"("signalId");
CREATE INDEX "PortfolioIqSignalDecision_organizationId_state_updatedAt_idx" ON "PortfolioIqSignalDecision"("organizationId", "state", "updatedAt" DESC);
CREATE INDEX "PortfolioIqSignalDecisionEvent_decisionId_createdAt_idx" ON "PortfolioIqSignalDecisionEvent"("decisionId", "createdAt" DESC);

ALTER TABLE "PortfolioIqSignalDecision" ADD CONSTRAINT "PortfolioIqSignalDecision_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "PortfolioIqSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqSignalDecisionEvent" ADD CONSTRAINT "PortfolioIqSignalDecisionEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "PortfolioIqSignalDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
