-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEntitlement" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "organizationId" TEXT,
    "guestEmail" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPass" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "organizationId" TEXT,
    "guestEmail" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "guestEmail" TEXT,
    "status" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_organizationId_key" ON "StripeCustomer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_userId_key" ON "StripeCustomer"("userId");

-- CreateIndex
CREATE INDEX "StripeCustomer_email_idx" ON "StripeCustomer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_stripeSessionId_key" ON "ReportEntitlement"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ReportEntitlement_guestEmail_idx" ON "ReportEntitlement"("guestEmail");

-- CreateIndex
CREATE INDEX "ReportEntitlement_organizationId_idx" ON "ReportEntitlement"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_organizationId_key" ON "ReportEntitlement"("pmSlug", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_guestEmail_key" ON "ReportEntitlement"("pmSlug", "guestEmail");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPass_stripeSessionId_key" ON "MarketPass"("stripeSessionId");

-- CreateIndex
CREATE INDEX "MarketPass_marketId_expiresAt_idx" ON "MarketPass"("marketId", "expiresAt");

-- CreateIndex
CREATE INDEX "MarketPass_guestEmail_idx" ON "MarketPass"("guestEmail");

-- CreateIndex
CREATE INDEX "MarketPass_organizationId_idx" ON "MarketPass"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_guestEmail_idx" ON "Subscription"("guestEmail");

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEntitlement" ADD CONSTRAINT "ReportEntitlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPass" ADD CONSTRAINT "MarketPass_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

