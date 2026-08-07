-- Operator-reported unit counts: ground truth for calibrating the size
-- estimator. Purely additive — no existing table is touched, so this is safe
-- to apply against the shared database on any deploy.
--
-- NOTE: `prisma migrate diff` against the live datasource also wanted to add
-- WatchListMember_watchListId_fkey here. That constraint is PRE-EXISTING drift
-- (the table was created without it in 20260717000000_watch_list_pins) and has
-- nothing to do with this change, so it is deliberately left out rather than
-- riding along unannounced. It needs its own migration and its own look at
-- whether orphaned member rows already exist.

-- CreateTable
CREATE TABLE "OperatorReportedSize" (
    "id" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "reportedUnits" INTEGER NOT NULL,
    "reportedAsOf" TIMESTAMP(3) NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceNote" TEXT,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorReportedSize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorReportedSize_targetKind_targetKey_key" ON "OperatorReportedSize"("targetKind", "targetKey");
