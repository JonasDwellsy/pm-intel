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
    "stripeSessionId" TEXT,
    "sourceCreditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCredit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "guestEmail" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "redeemedPmSlug" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportCredit_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "ReportEntitlement_sourceCreditId_key" ON "ReportEntitlement"("sourceCreditId");

-- CreateIndex
CREATE INDEX "ReportEntitlement_guestEmail_idx" ON "ReportEntitlement"("guestEmail");

-- CreateIndex
CREATE INDEX "ReportEntitlement_organizationId_idx" ON "ReportEntitlement"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_organizationId_key" ON "ReportEntitlement"("pmSlug", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntitlement_pmSlug_guestEmail_key" ON "ReportEntitlement"("pmSlug", "guestEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCredit_stripeSessionId_slot_key" ON "ReportCredit"("stripeSessionId", "slot");

-- CreateIndex
CREATE INDEX "ReportCredit_organizationId_redeemedAt_idx" ON "ReportCredit"("organizationId", "redeemedAt");

-- CreateIndex
CREATE INDEX "ReportCredit_guestEmail_redeemedAt_idx" ON "ReportCredit"("guestEmail", "redeemedAt");

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEntitlement" ADD CONSTRAINT "ReportEntitlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCredit" ADD CONSTRAINT "ReportCredit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
