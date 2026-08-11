ALTER TABLE "PortfolioIqFinancialAssumption"
  ADD COLUMN "conservativePct" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  ADD COLUMN "upsidePct" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'owner_interview',
  ADD COLUMN "sourceLabel" TEXT,
  ADD COLUMN "effectiveAt" TIMESTAMP(3),
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

CREATE TABLE "PortfolioIqOutcomeReview" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting_for_source',
  "sourceHealth" TEXT NOT NULL DEFAULT 'unchanged',
  "sourceAvailableThrough" TEXT,
  "comparison" TEXT NOT NULL,
  "conclusion" TEXT,
  "reviewNote" TEXT,
  "nextReviewAt" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqOutcomeReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqOutcomeReview_decisionId_periodKey_key" ON "PortfolioIqOutcomeReview"("decisionId", "periodKey");
CREATE INDEX "PortfolioIqOutcomeReview_portfolioId_status_generatedAt_idx" ON "PortfolioIqOutcomeReview"("portfolioId", "status", "generatedAt" DESC);
CREATE INDEX "PortfolioIqOutcomeReview_decisionId_generatedAt_idx" ON "PortfolioIqOutcomeReview"("decisionId", "generatedAt" DESC);

ALTER TABLE "PortfolioIqOutcomeReview" ADD CONSTRAINT "PortfolioIqOutcomeReview_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqOutcomeReview" ADD CONSTRAINT "PortfolioIqOutcomeReview_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "PortfolioIqSignalDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
