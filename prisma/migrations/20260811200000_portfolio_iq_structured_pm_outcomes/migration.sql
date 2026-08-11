-- This additive migration extends only the isolated Portfolio IQ collaboration
-- and outcome records. Existing Operator IQ tables and production behavior are
-- not changed.
ALTER TABLE "PortfolioIqPmBriefResponse"
  ADD COLUMN "assessment" TEXT,
  ADD COLUMN "recommendation" TEXT,
  ADD COLUMN "actionOwner" TEXT,
  ADD COLUMN "successMeasure" TEXT,
  ADD COLUMN "revisionCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PortfolioIqOutcomeReview"
  ADD COLUMN "implementationStatus" TEXT,
  ADD COLUMN "nextDecision" TEXT;
