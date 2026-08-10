-- Additive bedroom-segment review state. Existing property-level comp evidence
-- remains intact while staff can independently lock decision-grade segments.
CREATE TABLE "PortfolioIqCompSegment" (
    "id" TEXT NOT NULL,
    "compSetId" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioIqCompSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqCompSegment_compSetId_bedrooms_key" ON "PortfolioIqCompSegment"("compSetId", "bedrooms");
CREATE INDEX "PortfolioIqCompSegment_compSetId_status_idx" ON "PortfolioIqCompSegment"("compSetId", "status");
ALTER TABLE "PortfolioIqCompSegment" ADD CONSTRAINT "PortfolioIqCompSegment_compSetId_fkey" FOREIGN KEY ("compSetId") REFERENCES "PortfolioIqCompSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
