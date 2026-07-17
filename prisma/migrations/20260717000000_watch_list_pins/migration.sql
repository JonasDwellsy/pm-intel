-- v0.26 — Watch-list manual pins + kind discriminator.
-- Additive: one CREATE TABLE + two ALTERs (add kind column w/ default,
-- change isShared default). No existing row is rewritten — existing lists
-- keep isShared=true (shared) and get kind='criteria' via the column default.

-- AlterTable
ALTER TABLE "WatchList" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'criteria';
ALTER TABLE "WatchList" ALTER COLUMN "isShared" SET DEFAULT false;

-- CreateTable
CREATE TABLE "WatchListMember" (
    "id" TEXT NOT NULL,
    "watchListId" TEXT NOT NULL,
    "memberKey" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchListMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchListMember_watchListId_memberKey_key" ON "WatchListMember"("watchListId", "memberKey");

-- CreateIndex
CREATE INDEX "WatchListMember_watchListId_idx" ON "WatchListMember"("watchListId");
