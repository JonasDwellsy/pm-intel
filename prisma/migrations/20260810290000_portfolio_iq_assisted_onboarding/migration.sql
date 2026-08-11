-- Additive assisted-onboarding intake. Existing Operator IQ tables and
-- customer routes are intentionally untouched.
CREATE TABLE "PortfolioIqOnboardingRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "portfolioId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'started',
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "preferredContactWindow" TEXT,
  "timezone" TEXT,
  "intakeNotes" TEXT,
  "callRequestedAt" TIMESTAMP(3),
  "scheduledFor" TIMESTAMP(3),
  "intakeReceivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqOnboardingRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqOnboardingProperty" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "propertyName" TEXT,
  "addressLine" TEXT NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "unitCount" INTEGER,
  "assetType" TEXT,
  "sourceKind" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'received',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqOnboardingProperty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqOnboardingRequest_organizationId_key" ON "PortfolioIqOnboardingRequest"("organizationId");
CREATE INDEX "PortfolioIqOnboardingRequest_status_updatedAt_idx" ON "PortfolioIqOnboardingRequest"("status", "updatedAt" DESC);
CREATE INDEX "PortfolioIqOnboardingRequest_portfolioId_idx" ON "PortfolioIqOnboardingRequest"("portfolioId");
CREATE UNIQUE INDEX "PortfolioIqOnboardingProperty_requestId_addressLine_key" ON "PortfolioIqOnboardingProperty"("requestId", "addressLine");
CREATE INDEX "PortfolioIqOnboardingProperty_requestId_status_idx" ON "PortfolioIqOnboardingProperty"("requestId", "status");

ALTER TABLE "PortfolioIqOnboardingRequest" ADD CONSTRAINT "PortfolioIqOnboardingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqOnboardingProperty" ADD CONSTRAINT "PortfolioIqOnboardingProperty_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PortfolioIqOnboardingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
