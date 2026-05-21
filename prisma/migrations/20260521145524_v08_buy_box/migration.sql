-- CreateTable
CREATE TABLE "BuyBox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "requiredCriteria" TEXT NOT NULL DEFAULT '[]',
    "preferredCriteria" TEXT NOT NULL DEFAULT '[]',
    "excludedCriteria" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyBox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyBox_ownerId_idx" ON "BuyBox"("ownerId");
