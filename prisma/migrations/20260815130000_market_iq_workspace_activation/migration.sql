-- Add organization-scoped Market IQ setup preferences without changing any
-- Operator IQ, Portfolio IQ, report, recipient, or analytical data model.
CREATE TABLE "MarketIqWorkspacePreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultMarketId" TEXT NOT NULL,
    "defaultCities" TEXT NOT NULL DEFAULT '[]',
    "defaultZipCodes" TEXT NOT NULL DEFAULT '[]',
    "defaultSegments" TEXT NOT NULL DEFAULT '[]',
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIqWorkspacePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIqWorkspacePreference_organizationId_key"
ON "MarketIqWorkspacePreference"("organizationId");

CREATE INDEX "MarketIqWorkspacePreference_defaultMarketId_idx"
ON "MarketIqWorkspacePreference"("defaultMarketId");

ALTER TABLE "MarketIqWorkspacePreference"
ADD CONSTRAINT "MarketIqWorkspacePreference_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
