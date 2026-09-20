-- CreateTable
CREATE TABLE "MarketReportLead" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerMessageId" TEXT,
    "deliveryError" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketReportLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketReportLead_marketId_email_key" ON "MarketReportLead"("marketId", "email");

-- CreateIndex
CREATE INDEX "MarketReportLead_requestedAt_idx" ON "MarketReportLead"("requestedAt");

-- AddForeignKey
ALTER TABLE "MarketReportLead" ADD CONSTRAINT "MarketReportLead_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
