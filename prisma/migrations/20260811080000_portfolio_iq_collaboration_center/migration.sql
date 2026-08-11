-- Portfolio IQ only: additive PM delivery and owner-review lifecycle.
-- Operator IQ customer routes, scorecards, and source tables are untouched.
ALTER TABLE "PortfolioIqPmBrief"
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "recipientEmail" TEXT,
  ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN "deliveryProviderId" TEXT,
  ADD COLUMN "deliveryError" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "lastReminderAt" TIMESTAMP(3),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PortfolioIqPmBriefResponse"
  ADD COLUMN "ownerDisposition" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "ownerReviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

CREATE INDEX "PortfolioIqPmBrief_deliveryStatus_responseDueAt_idx"
  ON "PortfolioIqPmBrief"("deliveryStatus", "responseDueAt");

CREATE INDEX "PortfolioIqPmBriefResponse_ownerDisposition_submittedAt_idx"
  ON "PortfolioIqPmBriefResponse"("ownerDisposition", "submittedAt" DESC);
