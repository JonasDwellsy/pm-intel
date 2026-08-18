-- Additive Market IQ-only archive for immutable internal weekly briefings.
CREATE TABLE "MarketIqBriefingSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL,
    "sourcePeriods" TEXT NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIqBriefingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqBriefingSnapshot_organizationId_weekOf_key"
ON "MarketIqBriefingSnapshot"("organizationId", "weekOf");

CREATE INDEX "MarketIqBriefingSnapshot_organizationId_createdAt_idx"
ON "MarketIqBriefingSnapshot"("organizationId", "createdAt" DESC);

ALTER TABLE "MarketIqBriefingSnapshot"
ADD CONSTRAINT "MarketIqBriefingSnapshot_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
