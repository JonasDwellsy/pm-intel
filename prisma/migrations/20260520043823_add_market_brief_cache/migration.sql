-- CreateTable
CREATE TABLE "MarketBrief" (
    "id" TEXT NOT NULL,
    "marketSlug" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "headlineRead" TEXT NOT NULL,
    "shareMovement" TEXT NOT NULL,
    "operatorLandscape" TEXT NOT NULL,
    "notableSignals" TEXT NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketBrief_marketSlug_idx" ON "MarketBrief"("marketSlug");

-- CreateIndex
CREATE UNIQUE INDEX "MarketBrief_marketSlug_methodologyVersion_dataAsOf_key" ON "MarketBrief"("marketSlug", "methodologyVersion", "dataAsOf");
