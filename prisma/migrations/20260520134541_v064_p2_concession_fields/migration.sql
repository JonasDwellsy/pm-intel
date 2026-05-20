-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "operatorsWithConcessions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PM" ADD COLUMN     "concessionListingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "concessionPatterns" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "concessionRate" DOUBLE PRECISION,
ADD COLUMN     "concessionSampleText" TEXT;
