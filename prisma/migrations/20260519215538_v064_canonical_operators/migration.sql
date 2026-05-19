-- AlterTable
ALTER TABLE "PM" ADD COLUMN "canonicalOperatorId" TEXT;
ALTER TABLE "PM" ADD COLUMN "canonicalOperatorName" TEXT;

-- CreateTable
CREATE TABLE "CanonicalOperator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalSlug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "marketIds" TEXT NOT NULL,
    "pmSlugs" TEXT NOT NULL,
    "marketCount" INTEGER NOT NULL,
    "aggregateStats" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalOperator_canonicalSlug_key" ON "CanonicalOperator"("canonicalSlug");
