-- Additive review history for assisted Portfolio IQ comp curation. Existing
-- Operator IQ, Market IQ, and Portfolio IQ evidence snapshots remain intact.
ALTER TABLE "PortfolioIqCompSet"
ADD COLUMN "reviewedBy" TEXT;

ALTER TABLE "PortfolioIqCompMember"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'proposed',
ADD COLUMN "exclusionReason" TEXT,
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedBy" TEXT;

CREATE INDEX "PortfolioIqCompMember_compSetId_reviewStatus_idx"
ON "PortfolioIqCompMember"("compSetId", "reviewStatus");
