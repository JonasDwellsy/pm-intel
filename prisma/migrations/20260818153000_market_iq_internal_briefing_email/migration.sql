-- Additive, Market IQ-only user consent and internal briefing delivery tables.
CREATE TABLE "MarketIqBriefingEmailPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqBriefingEmailPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqBriefingEmailDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqBriefingEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqBriefingEmailPreference_organizationId_userId_key" ON "MarketIqBriefingEmailPreference"("organizationId", "userId");
CREATE INDEX "MarketIqBriefingEmailPreference_organizationId_enabled_idx" ON "MarketIqBriefingEmailPreference"("organizationId", "enabled");
CREATE UNIQUE INDEX "MarketIqBriefingEmailDelivery_snapshotId_userId_key" ON "MarketIqBriefingEmailDelivery"("snapshotId", "userId");
CREATE INDEX "MarketIqBriefingEmailDelivery_organizationId_createdAt_idx" ON "MarketIqBriefingEmailDelivery"("organizationId", "createdAt" DESC);
CREATE INDEX "MarketIqBriefingEmailDelivery_preferenceId_status_idx" ON "MarketIqBriefingEmailDelivery"("preferenceId", "status");

ALTER TABLE "MarketIqBriefingEmailPreference" ADD CONSTRAINT "MarketIqBriefingEmailPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqBriefingEmailDelivery" ADD CONSTRAINT "MarketIqBriefingEmailDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqBriefingEmailDelivery" ADD CONSTRAINT "MarketIqBriefingEmailDelivery_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketIqBriefingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqBriefingEmailDelivery" ADD CONSTRAINT "MarketIqBriefingEmailDelivery_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "MarketIqBriefingEmailPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
