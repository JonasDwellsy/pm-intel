-- Preserve the shadow queue comparison reviewed at approval time.
ALTER TABLE "PortfolioIqCalibrationProposal" ADD COLUMN "impactSnapshot" TEXT NOT NULL DEFAULT '{}';
