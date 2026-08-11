-- Additive staff review and promotion fields for assisted onboarding.
-- Operator IQ scorecards, rankings, and production customer tables are untouched.
ALTER TABLE "PortfolioIqOnboardingProperty"
  ADD COLUMN "canonicalAddress" TEXT,
  ADD COLUMN "promotionMode" TEXT,
  ADD COLUMN "targetAssetId" TEXT,
  ADD COLUMN "activatedAssetId" TEXT,
  ADD COLUMN "dwellsyCommunityId" TEXT,
  ADD COLUMN "observedOperatorName" TEXT,
  ADD COLUMN "matchConfidence" DOUBLE PRECISION,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

CREATE INDEX "PortfolioIqOnboardingProperty_activatedAssetId_idx"
  ON "PortfolioIqOnboardingProperty"("activatedAssetId");

ALTER TABLE "PortfolioIqOnboardingProperty"
  ADD CONSTRAINT "PortfolioIqOnboardingProperty_activatedAssetId_fkey"
  FOREIGN KEY ("activatedAssetId") REFERENCES "PortfolioIqAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
