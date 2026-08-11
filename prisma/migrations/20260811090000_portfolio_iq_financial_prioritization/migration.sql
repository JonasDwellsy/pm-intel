-- Portfolio IQ only: owner-controlled financial prioritization assumptions.
-- The calculation remains separate from Dwellsy observations and Operator IQ.
CREATE TABLE "PortfolioIqFinancialAssumption" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "bedrooms" INTEGER NOT NULL DEFAULT -1,
  "inventoryUnits" INTEGER,
  "affectedUnits" INTEGER,
  "realizationPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "note" TEXT,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioIqFinancialAssumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqFinancialAssumption_assetId_bedrooms_key"
  ON "PortfolioIqFinancialAssumption"("assetId", "bedrooms");

CREATE INDEX "PortfolioIqFinancialAssumption_assetId_updatedAt_idx"
  ON "PortfolioIqFinancialAssumption"("assetId", "updatedAt" DESC);

ALTER TABLE "PortfolioIqFinancialAssumption"
  ADD CONSTRAINT "PortfolioIqFinancialAssumption_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
