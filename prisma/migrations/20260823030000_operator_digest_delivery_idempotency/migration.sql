-- Additive delivery ledger for both Operator IQ scheduled digest types.
-- The unique key is the atomic, cross-run idempotency boundary. A delivery is
-- claimed before SendGrid is called, so overlapping invocations cannot both
-- send the same digest to the same user for the same source snapshot.
CREATE TABLE "OperatorDigestRun" (
    "id" TEXT NOT NULL,
    "digestKind" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "uncertainCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorDigestRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorDigestDelivery" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "digestKind" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "providerMessageId" TEXT,
    "error" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorDigestDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorDigestRun_digestKind_snapshotDate_idx" ON "OperatorDigestRun"("digestKind", "snapshotDate");
CREATE INDEX "OperatorDigestRun_startedAt_idx" ON "OperatorDigestRun"("startedAt");
CREATE UNIQUE INDEX "OperatorDigestDelivery_digestKind_snapshotDate_userId_key" ON "OperatorDigestDelivery"("digestKind", "snapshotDate", "userId");
CREATE INDEX "OperatorDigestDelivery_runId_status_idx" ON "OperatorDigestDelivery"("runId", "status");

ALTER TABLE "OperatorDigestDelivery" ADD CONSTRAINT "OperatorDigestDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OperatorDigestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
