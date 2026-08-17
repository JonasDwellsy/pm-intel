-- Additive review-audit fields for the Market IQ PM inbox. These columns do
-- not affect Operator IQ or Portfolio IQ data or routes.
ALTER TABLE "MarketIqEditionDraft"
  ADD COLUMN "reviewStartedAt" TIMESTAMP(3),
  ADD COLUMN "reviewStartedByUserId" TEXT,
  ADD COLUMN "dismissedAt" TIMESTAMP(3),
  ADD COLUMN "dismissedByUserId" TEXT,
  ADD COLUMN "dismissalReason" TEXT;
