-- Append-only Market IQ email evidence. This migration does not alter
-- Operator IQ, Portfolio IQ, analytical Trends storage, or existing sends.
CREATE TABLE "MarketIqEmailEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportSendId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "responseCode" TEXT,
  "engagementStrength" TEXT NOT NULL DEFAULT 'operational',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketIqEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqEmailEvent_providerEventId_key" ON "MarketIqEmailEvent"("providerEventId");
CREATE INDEX "MarketIqEmailEvent_organizationId_eventType_occurredAt_idx" ON "MarketIqEmailEvent"("organizationId", "eventType", "occurredAt" DESC);
CREATE INDEX "MarketIqEmailEvent_reportSendId_eventType_occurredAt_idx" ON "MarketIqEmailEvent"("reportSendId", "eventType", "occurredAt" DESC);
CREATE INDEX "MarketIqEmailEvent_providerMessageId_idx" ON "MarketIqEmailEvent"("providerMessageId");

ALTER TABLE "MarketIqEmailEvent" ADD CONSTRAINT "MarketIqEmailEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqEmailEvent" ADD CONSTRAINT "MarketIqEmailEvent_reportSendId_fkey" FOREIGN KEY ("reportSendId") REFERENCES "MarketIqReportSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
