ALTER TABLE "MarketIqDailyWatchlistMatch"
  ADD COLUMN "destinationHref" TEXT,
  ADD COLUMN "matchKind" TEXT NOT NULL DEFAULT 'event',
  ADD COLUMN "evidenceEventKeys" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "evidenceCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "windowStartAt" TIMESTAMP(3),
  ADD COLUMN "windowEndAt" TIMESTAMP(3),
  ADD COLUMN "signalRuleId" TEXT;

CREATE TABLE "MarketIqCompetitiveSetSignalRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "propertyScope" TEXT NOT NULL DEFAULT 'peers',
    "windowDays" INTEGER NOT NULL DEFAULT 1,
    "condition" TEXT NOT NULL DEFAULT 'count_at_least',
    "threshold" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_windowDays_check" CHECK ("windowDays" IN (1, 7)),
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_threshold_check" CHECK ("threshold" BETWEEN 1 AND 50),
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_scope_check" CHECK ("propertyScope" IN ('peers', 'subject', 'all')),
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_condition_check" CHECK ("condition" IN ('count_at_least', 'increase_at_least')),
    CONSTRAINT "MarketIqCompetitiveSetSignalRule_comparison_window_check" CHECK ("condition" <> 'increase_at_least' OR "windowDays" = 7)
);

CREATE UNIQUE INDEX "MarketIqCompetitiveSetSignalRule_watchlistId_userId_eventType_propertyScope_windowDays_condition_key"
  ON "MarketIqCompetitiveSetSignalRule"("watchlistId", "userId", "eventType", "propertyScope", "windowDays", "condition");
CREATE INDEX "MarketIqCompetitiveSetSignalRule_organizationId_userId_enabled_updatedAt_idx"
  ON "MarketIqCompetitiveSetSignalRule"("organizationId", "userId", "enabled", "updatedAt" DESC);
CREATE INDEX "MarketIqCompetitiveSetSignalRule_watchlistId_enabled_idx"
  ON "MarketIqCompetitiveSetSignalRule"("watchlistId", "enabled");
CREATE INDEX "MarketIqDailyWatchlistMatch_signalRuleId_createdAt_idx"
  ON "MarketIqDailyWatchlistMatch"("signalRuleId", "createdAt" DESC);

ALTER TABLE "MarketIqCompetitiveSetSignalRule" ADD CONSTRAINT "MarketIqCompetitiveSetSignalRule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqCompetitiveSetSignalRule" ADD CONSTRAINT "MarketIqCompetitiveSetSignalRule_watchlistId_fkey"
  FOREIGN KEY ("watchlistId") REFERENCES "MarketIqDailyWatchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketIqDailyWatchlistMatch" ADD CONSTRAINT "MarketIqDailyWatchlistMatch_signalRuleId_fkey"
  FOREIGN KEY ("signalRuleId") REFERENCES "MarketIqCompetitiveSetSignalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
