-- Additive Portfolio Watch signals and delivery records. These tables are
-- isolated from the existing Operator IQ and Market IQ digest systems.
CREATE TABLE "PortfolioIqSignal" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "rankScore" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "ownerQuestion" TEXT,
    "evidence" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqDigestPreference" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cadence" TEXT NOT NULL DEFAULT 'weekly',
    "lastDeliveredAt" TIMESTAMP(3),
    "lastSignalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqDigestPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqDigestDelivery" (
    "id" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "signalCutoff" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqDigestDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqSignal_fingerprint_key" ON "PortfolioIqSignal"("fingerprint");
CREATE INDEX "PortfolioIqSignal_portfolioId_status_rankScore_idx" ON "PortfolioIqSignal"("portfolioId", "status", "rankScore" DESC);
CREATE INDEX "PortfolioIqSignal_assetId_status_idx" ON "PortfolioIqSignal"("assetId", "status");
CREATE INDEX "PortfolioIqSignal_observedAt_idx" ON "PortfolioIqSignal"("observedAt" DESC);
CREATE UNIQUE INDEX "PortfolioIqDigestPreference_portfolioId_userId_key" ON "PortfolioIqDigestPreference"("portfolioId", "userId");
CREATE INDEX "PortfolioIqDigestPreference_organizationId_enabled_idx" ON "PortfolioIqDigestPreference"("organizationId", "enabled");
CREATE UNIQUE INDEX "PortfolioIqDigestDelivery_preferenceId_signalCutoff_key" ON "PortfolioIqDigestDelivery"("preferenceId", "signalCutoff");
CREATE INDEX "PortfolioIqDigestDelivery_status_createdAt_idx" ON "PortfolioIqDigestDelivery"("status", "createdAt" DESC);

ALTER TABLE "PortfolioIqSignal" ADD CONSTRAINT "PortfolioIqSignal_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqSignal" ADD CONSTRAINT "PortfolioIqSignal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqDigestPreference" ADD CONSTRAINT "PortfolioIqDigestPreference_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqDigestDelivery" ADD CONSTRAINT "PortfolioIqDigestDelivery_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "PortfolioIqDigestPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
