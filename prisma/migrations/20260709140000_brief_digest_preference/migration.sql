-- Briefs V2 Phase 3 — per-user prefs for the scheduled market-brief email.
-- Separate from DigestPreference (the watch-list digest) so the two emails have
-- independent unsubscribe state, cadence, and "last notified" watermark.
CREATE TABLE "BriefDigestPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "cadence" TEXT NOT NULL DEFAULT 'monthly',
    "lastNotifiedSnapshotDate" TIMESTAMP(3),
    "lastDigestAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BriefDigestPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BriefDigestPreference_userId_key" ON "BriefDigestPreference"("userId");
