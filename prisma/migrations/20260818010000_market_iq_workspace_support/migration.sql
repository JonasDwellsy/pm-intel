-- Additive Market IQ-only customer-success workflow. Operator IQ and
-- Portfolio IQ models and access paths are unchanged.
CREATE TABLE "MarketIqWorkspaceSupportState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assignedTo" TEXT,
  "assignedUserId" TEXT,
  "followUpAt" TIMESTAMP(3),
  "latestNote" TEXT,
  "updatedByUserId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketIqWorkspaceSupportState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqWorkspaceSupportEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supportStateId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "assignedTo" TEXT,
  "assignedUserId" TEXT,
  "followUpAt" TIMESTAMP(3),
  "note" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketIqWorkspaceSupportEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqWorkspaceSupportState_organizationId_key" ON "MarketIqWorkspaceSupportState"("organizationId");
CREATE INDEX "MarketIqWorkspaceSupportState_status_followUpAt_idx" ON "MarketIqWorkspaceSupportState"("status", "followUpAt");
CREATE INDEX "MarketIqWorkspaceSupportState_assignedUserId_status_idx" ON "MarketIqWorkspaceSupportState"("assignedUserId", "status");
CREATE INDEX "MarketIqWorkspaceSupportEvent_organizationId_createdAt_idx" ON "MarketIqWorkspaceSupportEvent"("organizationId", "createdAt" DESC);
CREATE INDEX "MarketIqWorkspaceSupportEvent_supportStateId_createdAt_idx" ON "MarketIqWorkspaceSupportEvent"("supportStateId", "createdAt" DESC);

ALTER TABLE "MarketIqWorkspaceSupportState"
  ADD CONSTRAINT "MarketIqWorkspaceSupportState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketIqWorkspaceSupportEvent"
  ADD CONSTRAINT "MarketIqWorkspaceSupportEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketIqWorkspaceSupportEvent"
  ADD CONSTRAINT "MarketIqWorkspaceSupportEvent_supportStateId_fkey"
  FOREIGN KEY ("supportStateId") REFERENCES "MarketIqWorkspaceSupportState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
