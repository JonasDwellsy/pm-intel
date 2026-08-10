-- Additive Portfolio IQ comp-set snapshots. Existing Operator IQ and Market
-- IQ tables remain unchanged.
CREATE TABLE "PortfolioIqCompSet" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "methodology" TEXT NOT NULL,
    "sourceImportId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqCompSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqCompMember" (
    "id" TEXT NOT NULL,
    "compSetId" TEXT NOT NULL,
    "comparisonKey" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "propertyLabel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "propertyType" TEXT NOT NULL,
    "bedrooms" DOUBLE PRECISION,
    "bathrooms" DOUBLE PRECISION,
    "askingRent" DOUBLE PRECISION,
    "squareFeet" DOUBLE PRECISION,
    "activatedAt" TIMESTAMP(3),
    "selectionReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioIqCompMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqCompSet_assetId_key" ON "PortfolioIqCompSet"("assetId");
CREATE INDEX "PortfolioIqCompSet_sourceImportId_idx" ON "PortfolioIqCompSet"("sourceImportId");
CREATE UNIQUE INDEX "PortfolioIqCompMember_compSetId_comparisonKey_key" ON "PortfolioIqCompMember"("compSetId", "comparisonKey");
CREATE INDEX "PortfolioIqCompMember_compSetId_idx" ON "PortfolioIqCompMember"("compSetId");
CREATE INDEX "PortfolioIqCompMember_sourceRecordId_idx" ON "PortfolioIqCompMember"("sourceRecordId");

ALTER TABLE "PortfolioIqCompSet" ADD CONSTRAINT "PortfolioIqCompSet_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqCompMember" ADD CONSTRAINT "PortfolioIqCompMember_compSetId_fkey"
FOREIGN KEY ("compSetId") REFERENCES "PortfolioIqCompSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
