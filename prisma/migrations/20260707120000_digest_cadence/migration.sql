-- AlterTable
ALTER TABLE "DigestPreference" ADD COLUMN     "cadence" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "lastNotifiedSnapshotDate" TIMESTAMP(3);

