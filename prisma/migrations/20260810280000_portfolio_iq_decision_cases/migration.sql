-- Additive owner decision-case fields. Operator IQ source tables and routes
-- are intentionally untouched.
ALTER TABLE "PortfolioIqSignalDecision"
  ADD COLUMN "actionPlan" TEXT,
  ADD COLUMN "successMeasure" TEXT,
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "monitoringWindowDays" INTEGER,
  ADD COLUMN "baselineEvidence" TEXT,
  ADD COLUMN "baselineCapturedAt" TIMESTAMP(3);
