-- Governed Portfolio IQ calibration. Feedback can create review proposals,
-- but only an administrator-approved calibration affects ranking.
CREATE TABLE "PortfolioIqFindingCalibration" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL DEFAULT 'signal_type',
    "scopeValue" TEXT NOT NULL,
    "scoreAdjustment" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqFindingCalibration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqCalibrationProposal" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "calibrationId" TEXT,
    "scopeKind" TEXT NOT NULL DEFAULT 'signal_type',
    "scopeValue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "priorScoreAdjustment" INTEGER NOT NULL DEFAULT 0,
    "proposedScoreAdjustment" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "usefulCount" INTEGER NOT NULL,
    "alreadyKnownCount" INTEGER NOT NULL,
    "noiseCount" INTEGER NOT NULL,
    "contextErrorCount" INTEGER NOT NULL,
    "baselineUsefulRate" DOUBLE PRECISION,
    "rationale" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqCalibrationProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqFindingCalibration_portfolioId_scopeKind_scopeValue_key" ON "PortfolioIqFindingCalibration"("portfolioId", "scopeKind", "scopeValue");
CREATE INDEX "PortfolioIqFindingCalibration_organizationId_updatedAt_idx" ON "PortfolioIqFindingCalibration"("organizationId", "updatedAt" DESC);
CREATE INDEX "PortfolioIqCalibrationProposal_organizationId_status_proposedAt_idx" ON "PortfolioIqCalibrationProposal"("organizationId", "status", "proposedAt" DESC);
CREATE INDEX "PortfolioIqCalibrationProposal_portfolioId_scopeKind_scopeValue_proposedAt_idx" ON "PortfolioIqCalibrationProposal"("portfolioId", "scopeKind", "scopeValue", "proposedAt" DESC);

ALTER TABLE "PortfolioIqFindingCalibration" ADD CONSTRAINT "PortfolioIqFindingCalibration_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqCalibrationProposal" ADD CONSTRAINT "PortfolioIqCalibrationProposal_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqCalibrationProposal" ADD CONSTRAINT "PortfolioIqCalibrationProposal_calibrationId_fkey" FOREIGN KEY ("calibrationId") REFERENCES "PortfolioIqFindingCalibration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
