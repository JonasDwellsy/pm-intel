-- Portfolio IQ communication telemetry only. Operator IQ tables and access
-- paths are not changed.
ALTER TABLE "PortfolioIqPilotIntervention" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "PortfolioIqPmBrief"
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "lastEmailEventAt" TIMESTAMP(3),
  ADD COLUMN "lastEmailEventType" TEXT;
ALTER TABLE "PortfolioIqDigestDelivery"
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "lastEmailEventAt" TIMESTAMP(3),
  ADD COLUMN "lastEmailEventType" TEXT;

-- Existing timestamps represent SendGrid API acceptance. Preserve that
-- evidence under its truthful name and wait for verified webhook evidence
-- before claiming delivery.
UPDATE "PortfolioIqPmBrief" SET "acceptedAt" = "deliveredAt", "deliveredAt" = NULL WHERE "deliveredAt" IS NOT NULL;
UPDATE "PortfolioIqDigestDelivery" SET "acceptedAt" = "deliveredAt", "deliveredAt" = NULL WHERE "deliveredAt" IS NOT NULL;

CREATE UNIQUE INDEX "PortfolioIqPilotIntervention_sourceEventId_key" ON "PortfolioIqPilotIntervention"("sourceEventId");

CREATE TABLE "PortfolioIqEmailEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "messageKind" TEXT NOT NULL,
  "messageRecordId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "responseCode" TEXT,
  "engagementStrength" TEXT NOT NULL DEFAULT 'operational',
  "interventionCreatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioIqEmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PortfolioIqEmailEvent_providerEventId_key" ON "PortfolioIqEmailEvent"("providerEventId");
CREATE INDEX "PortfolioIqEmailEvent_organizationId_occurredAt_idx" ON "PortfolioIqEmailEvent"("organizationId", "occurredAt" DESC);
CREATE INDEX "PortfolioIqEmailEvent_portfolioId_occurredAt_idx" ON "PortfolioIqEmailEvent"("portfolioId", "occurredAt" DESC);
CREATE INDEX "PortfolioIqEmailEvent_messageKind_messageRecordId_idx" ON "PortfolioIqEmailEvent"("messageKind", "messageRecordId");
ALTER TABLE "PortfolioIqEmailEvent" ADD CONSTRAINT "PortfolioIqEmailEvent_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
