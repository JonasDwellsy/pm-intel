-- v0.22 — per-organization market entitlements.
--
-- Dwellsy IQ is sold by market. This adds the ability to provision a
-- specific subset of markets per client org (e.g. a client who bought 15
-- of 32), managed entirely from the admin panel — no Clerk involvement.
--
-- Two entitlement shapes:
--   * Organization.allMarkets = true  → entitled to ALL current + future
--     markets (internal/comp accounts, national-tier clients).
--   * allMarkets = false              → entitled only to the explicit
--     (org, market) grants in OrganizationMarketAccess.
--
-- Default for NEW orgs is fail-closed (allMarkets=false, zero grants):
-- access is turned on per deal. The UPDATE below backfills every
-- PRE-EXISTING org to allMarkets=true so current users + team orgs keep
-- full access and nobody goes dark on deploy.

-- AlterTable — new orgs default to fail-closed.
ALTER TABLE "Organization" ADD COLUMN "allMarkets" BOOLEAN NOT NULL DEFAULT false;

-- Backfill — existing orgs (the live users' personal orgs + any team orgs)
-- keep full access. Runs once at migrate time; orgs created afterward use
-- the column default (false).
UPDATE "Organization" SET "allMarkets" = true;

-- CreateTable — explicit per-market grants.
CREATE TABLE "OrganizationMarketAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMarketAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMarketAccess_organizationId_marketId_key" ON "OrganizationMarketAccess"("organizationId", "marketId");

-- CreateIndex
CREATE INDEX "OrganizationMarketAccess_organizationId_idx" ON "OrganizationMarketAccess"("organizationId");

-- AddForeignKey
ALTER TABLE "OrganizationMarketAccess" ADD CONSTRAINT "OrganizationMarketAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
