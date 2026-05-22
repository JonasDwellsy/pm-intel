-- v0.16 (PR #57) — Watch list change-detection feedback loop.
--
-- Adds two new tables. No changes to existing tables.
--
--   1. OperatorSnapshot — one row per (PM × dataAsOf), captured at
--      seed time. The @@unique([pmSlug, snapshotDate]) constraint
--      makes capture idempotent: re-deploys against the same JSON
--      use prisma's createMany({ skipDuplicates: true }) and no-op.
--      snapshotDate stamps the data-cutoff (PM.dataAsOf), not the
--      deploy time — so the snapshot cadence inherits the monthly
--      data-refresh cadence automatically.
--
--   2. WatchListView — one row per (user × WatchList × view), written
--      every time a signed-in user loads a watch list's results
--      page. Drives the "since your last visit" banner. Cascade-
--      deleted with its parent WatchList.
--
-- See src/lib/watch-list/change-detection.ts for the diff logic that
-- reads from these tables.

-- CreateTable
CREATE TABLE "OperatorSnapshot" (
    "id" TEXT NOT NULL,
    "pmSlug" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "starsPerMetric" TEXT NOT NULL,
    "starGoldCount" INTEGER NOT NULL,
    "starSilverCount" INTEGER NOT NULL,
    "estimatedPortfolioPoint" INTEGER,
    "estimatedPortfolioBand" TEXT,
    "topMSAs" TEXT NOT NULL,
    "topSubmarkets" TEXT NOT NULL,
    "concessionRate" DOUBLE PRECISION,
    "isEligibleForRanking" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSnapshot_pmSlug_snapshotDate_key"
  ON "OperatorSnapshot"("pmSlug", "snapshotDate");

-- CreateIndex
-- Latest-snapshot lookups + closest-to-X range scans are the two
-- hot queries. DESC on snapshotDate makes "find the most recent
-- at-or-before X" a single index range scan.
CREATE INDEX "OperatorSnapshot_pmSlug_snapshotDate_idx"
  ON "OperatorSnapshot"("pmSlug", "snapshotDate" DESC);

-- CreateTable
CREATE TABLE "WatchListView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchListId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchListView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Covers "find the prior viewedAt for this user/watch-list pair" —
-- the only hot query against this table.
CREATE INDEX "WatchListView_userId_watchListId_viewedAt_idx"
  ON "WatchListView"("userId", "watchListId", "viewedAt" DESC);

-- AddForeignKey
ALTER TABLE "WatchListView" ADD CONSTRAINT "WatchListView_watchListId_fkey"
  FOREIGN KEY ("watchListId") REFERENCES "WatchList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
