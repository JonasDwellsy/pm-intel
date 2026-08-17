-- Explicit, PM-controlled enrollment for the private recurring-edition engine.
-- Existing workspaces remain disabled until a signed-in user opts in after the
-- readiness checks pass. No Operator IQ or Portfolio IQ relation is changed.
ALTER TABLE "MarketIqWorkspacePreference"
  ADD COLUMN "recurringEditionsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurringEnabledAt" TIMESTAMP(3),
  ADD COLUMN "recurringEnabledByUserId" TEXT;
