-- Market-level recurring delivery preference and explicit per-recipient
-- approval. These fields are additive and do not enroll or send to anyone.
ALTER TABLE "MarketIqMarketPreference"
  ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'review';

ALTER TABLE "MarketIqReportRecipient"
  ADD COLUMN "recurringDeliveryApprovedAt" TIMESTAMP(3),
  ADD COLUMN "recurringDeliveryApprovedByUserId" TEXT;
