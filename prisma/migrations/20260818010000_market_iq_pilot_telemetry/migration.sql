-- Additive Market IQ customer-journey telemetry. This table is isolated from
-- Operator IQ and Portfolio IQ models and records explicit workflow events
-- only. It does not capture page views or analytical content.
CREATE TABLE "MarketIqJourneyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventKey" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "sourceRoute" TEXT,
    "subjectId" TEXT,
    "dedupeKey" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIqJourneyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqJourneyEvent_dedupeKey_key" ON "MarketIqJourneyEvent"("dedupeKey");
CREATE INDEX "MarketIqJourneyEvent_organizationId_occurredAt_idx" ON "MarketIqJourneyEvent"("organizationId", "occurredAt" DESC);
CREATE INDEX "MarketIqJourneyEvent_organizationId_milestone_status_idx" ON "MarketIqJourneyEvent"("organizationId", "milestone", "status");
CREATE INDEX "MarketIqJourneyEvent_eventKey_occurredAt_idx" ON "MarketIqJourneyEvent"("eventKey", "occurredAt" DESC);

ALTER TABLE "MarketIqJourneyEvent" ADD CONSTRAINT "MarketIqJourneyEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
