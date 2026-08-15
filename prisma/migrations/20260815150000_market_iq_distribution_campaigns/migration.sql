ALTER TABLE "MarketIqReportRecipient"
ADD COLUMN "emailStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "suppressionReason" TEXT,
ADD COLUMN "suppressedAt" TIMESTAMP(3);

CREATE TABLE "MarketIqDistributionCampaign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdByUserId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqDistributionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqDistributionCampaignRecipient" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "sendId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqDistributionCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketIqDistributionCampaign_organizationId_status_createdAt_idx"
ON "MarketIqDistributionCampaign"("organizationId", "status", "createdAt" DESC);
CREATE INDEX "MarketIqDistributionCampaign_reportId_idx"
ON "MarketIqDistributionCampaign"("reportId");
CREATE UNIQUE INDEX "MarketIqDistributionCampaignRecipient_reportId_recipientId_key"
ON "MarketIqDistributionCampaignRecipient"("reportId", "recipientId");
CREATE INDEX "MarketIqDistributionCampaignRecipient_campaignId_status_idx"
ON "MarketIqDistributionCampaignRecipient"("campaignId", "status");
CREATE INDEX "MarketIqDistributionCampaignRecipient_organizationId_createdAt_idx"
ON "MarketIqDistributionCampaignRecipient"("organizationId", "createdAt" DESC);

ALTER TABLE "MarketIqDistributionCampaign"
ADD CONSTRAINT "MarketIqDistributionCampaign_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDistributionCampaign"
ADD CONSTRAINT "MarketIqDistributionCampaign_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "MarketIqReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDistributionCampaignRecipient"
ADD CONSTRAINT "MarketIqDistributionCampaignRecipient_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDistributionCampaignRecipient"
ADD CONSTRAINT "MarketIqDistributionCampaignRecipient_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "MarketIqDistributionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDistributionCampaignRecipient"
ADD CONSTRAINT "MarketIqDistributionCampaignRecipient_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "MarketIqReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDistributionCampaignRecipient"
ADD CONSTRAINT "MarketIqDistributionCampaignRecipient_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "MarketIqReportRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
