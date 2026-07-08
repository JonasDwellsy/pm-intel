-- CreateTable
CREATE TABLE "DigestPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchListDigestRun" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WatchListDigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchListDigestSend" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchListDigestSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigestPreference_userId_key" ON "DigestPreference"("userId");

-- CreateIndex
CREATE INDEX "WatchListDigestRun_snapshotDate_idx" ON "WatchListDigestRun"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "WatchListDigestSend_runId_userId_key" ON "WatchListDigestSend"("runId", "userId");

-- AddForeignKey
ALTER TABLE "WatchListDigestSend" ADD CONSTRAINT "WatchListDigestSend_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WatchListDigestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

