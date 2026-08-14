-- PM-branded Market IQ report workflow. Additive only: no existing Operator
-- IQ or Portfolio IQ relation is altered or removed.
CREATE TABLE "OrganizationBrandProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBrandProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scope" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "subjectAddress" TEXT,
    "brandProfileId" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqReportRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqReportRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqReportSend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'not_sent',
    "deliveryProviderId" TEXT,
    "deliveryError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastEmailEventAt" TIMESTAMP(3),
    "lastEmailEventType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqReportSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationBrandProfile_organizationId_key" ON "OrganizationBrandProfile"("organizationId");
CREATE UNIQUE INDEX "MarketIqReport_publicToken_key" ON "MarketIqReport"("publicToken");
CREATE INDEX "MarketIqReport_organizationId_marketId_createdAt_idx" ON "MarketIqReport"("organizationId", "marketId", "createdAt" DESC);
CREATE INDEX "MarketIqReport_status_publishedAt_idx" ON "MarketIqReport"("status", "publishedAt" DESC);
CREATE UNIQUE INDEX "MarketIqReportRecipient_organizationId_email_key" ON "MarketIqReportRecipient"("organizationId", "email");
CREATE INDEX "MarketIqReportRecipient_organizationId_kind_name_idx" ON "MarketIqReportRecipient"("organizationId", "kind", "name");
CREATE INDEX "MarketIqReportSend_organizationId_deliveryStatus_createdAt_idx" ON "MarketIqReportSend"("organizationId", "deliveryStatus", "createdAt" DESC);
CREATE INDEX "MarketIqReportSend_reportId_createdAt_idx" ON "MarketIqReportSend"("reportId", "createdAt" DESC);
CREATE INDEX "MarketIqReportSend_recipientId_createdAt_idx" ON "MarketIqReportSend"("recipientId", "createdAt" DESC);
CREATE INDEX "MarketIqReportSend_deliveryProviderId_idx" ON "MarketIqReportSend"("deliveryProviderId");

ALTER TABLE "OrganizationBrandProfile" ADD CONSTRAINT "OrganizationBrandProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqReport" ADD CONSTRAINT "MarketIqReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqReport" ADD CONSTRAINT "MarketIqReport_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "OrganizationBrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketIqReportRecipient" ADD CONSTRAINT "MarketIqReportRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqReportSend" ADD CONSTRAINT "MarketIqReportSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqReportSend" ADD CONSTRAINT "MarketIqReportSend_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketIqReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqReportSend" ADD CONSTRAINT "MarketIqReportSend_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "MarketIqReportRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
