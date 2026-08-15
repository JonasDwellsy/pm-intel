-- Additive commercial provisioning for Market IQ. Customer and billing data
-- remain in the primary application database; the isolated analytical store
-- is unchanged.

CREATE TABLE "MarketIqSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "planKey" TEXT NOT NULL DEFAULT 'single_market_monthly',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "provisionedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqSubscriptionMarket" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIqSubscriptionMarket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIqBillingEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqBillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqSubscription_stripeSubscriptionId_key" ON "MarketIqSubscription"("stripeSubscriptionId");
CREATE INDEX "MarketIqSubscription_organizationId_status_idx" ON "MarketIqSubscription"("organizationId", "status");
CREATE INDEX "MarketIqSubscription_stripeCustomerId_idx" ON "MarketIqSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX "MarketIqSubscriptionMarket_subscriptionId_marketId_key" ON "MarketIqSubscriptionMarket"("subscriptionId", "marketId");
CREATE INDEX "MarketIqSubscriptionMarket_marketId_idx" ON "MarketIqSubscriptionMarket"("marketId");
CREATE UNIQUE INDEX "MarketIqBillingEvent_stripeEventId_key" ON "MarketIqBillingEvent"("stripeEventId");
CREATE INDEX "MarketIqBillingEvent_status_createdAt_idx" ON "MarketIqBillingEvent"("status", "createdAt" DESC);

ALTER TABLE "MarketIqSubscription" ADD CONSTRAINT "MarketIqSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqSubscriptionMarket" ADD CONSTRAINT "MarketIqSubscriptionMarket_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MarketIqSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
