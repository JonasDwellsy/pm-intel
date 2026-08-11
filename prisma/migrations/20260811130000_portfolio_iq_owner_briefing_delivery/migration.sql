ALTER TABLE "PortfolioIqDigestDelivery"
  ADD COLUMN "deliveryKey" TEXT,
  ADD COLUMN "triggerKind" TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN "briefingVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "materialFingerprint" TEXT,
  ADD COLUMN "snapshot" TEXT;

UPDATE "PortfolioIqDigestDelivery"
SET "deliveryKey" = "id"
WHERE "deliveryKey" IS NULL;

ALTER TABLE "PortfolioIqDigestDelivery"
  ALTER COLUMN "deliveryKey" SET NOT NULL;

CREATE UNIQUE INDEX "PortfolioIqDigestDelivery_deliveryKey_key"
ON "PortfolioIqDigestDelivery"("deliveryKey");

CREATE INDEX "PortfolioIqDigestDelivery_preferenceId_materialFingerprint_idx"
ON "PortfolioIqDigestDelivery"("preferenceId", "materialFingerprint");
