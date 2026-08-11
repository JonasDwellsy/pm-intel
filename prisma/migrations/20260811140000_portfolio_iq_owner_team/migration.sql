ALTER TABLE "PortfolioIqSignalDecision"
  ADD COLUMN "assignedUserId" TEXT;

ALTER TABLE "PortfolioIqSignalDecisionEvent"
  ADD COLUMN "assignedUserId" TEXT;

CREATE INDEX "PortfolioIqSignalDecision_organizationId_assignedUserId_state_idx"
ON "PortfolioIqSignalDecision"("organizationId", "assignedUserId", "state");
