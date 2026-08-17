-- Additive Market IQ launch verification ledger. This table is isolated from
-- Operator IQ, Portfolio IQ, recipients, campaigns, and customer send history.
CREATE TABLE "MarketIqTestDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqTestDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketIqTestDelivery_organizationId_createdAt_idx"
ON "MarketIqTestDelivery"("organizationId", "createdAt" DESC);

CREATE INDEX "MarketIqTestDelivery_reportId_createdAt_idx"
ON "MarketIqTestDelivery"("reportId", "createdAt" DESC);

CREATE INDEX "MarketIqTestDelivery_requestedByUserId_createdAt_idx"
ON "MarketIqTestDelivery"("requestedByUserId", "createdAt" DESC);

ALTER TABLE "MarketIqTestDelivery"
ADD CONSTRAINT "MarketIqTestDelivery_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketIqTestDelivery"
ADD CONSTRAINT "MarketIqTestDelivery_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "MarketIqReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
