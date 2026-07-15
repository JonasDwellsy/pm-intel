-- v0.24 — First-party internal usage-analytics event log.
--
-- Additive-only: one CREATE TABLE + four CREATE INDEX statements. No
-- DROP/ALTER of any existing table. Written fire-and-forget server-side
-- from authed surfaces; read only from /admin/usage. Stores Clerk IDs
-- only (names/emails resolved at read time). Parallel sink to PostHog.

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "eventName" TEXT NOT NULL,
    "targetKind" TEXT,
    "targetSlug" TEXT,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_occurredAt_idx" ON "UsageEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_idx" ON "UsageEvent"("userId");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_idx" ON "UsageEvent"("orgId");

-- CreateIndex
CREATE INDEX "UsageEvent_eventName_idx" ON "UsageEvent"("eventName");
