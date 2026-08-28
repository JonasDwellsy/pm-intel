import "server-only";

import { MARKET_IQ_MARKETS } from "@/data/market-iq/markets";
import { MARKET_IQ_TRACKED_MARKETS } from "@/data/market-iq/tracked-markets";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

const HISTORY_DAYS = 7;
const COMPLETE_FEED_STATUSES = new Set(["complete", "baseline_complete"]);

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function expectedDates(now: Date) {
  const today = utcDay(now);
  return Array.from({ length: HISTORY_DAYS }, (_, index) =>
    dateKey(new Date(today.getTime() - (HISTORY_DAYS - 1 - index) * 86_400_000)),
  );
}

export async function loadMarketIqDataOperations(now = new Date()) {
  const dates = expectedDates(now);
  const today = dates.at(-1)!;
  const start = new Date(`${dates[0]}T00:00:00.000Z`);
  const trackedCodes = MARKET_IQ_TRACKED_MARKETS.map((market) => market.cbsaCode);
  const liveMarketIds = MARKET_IQ_MARKETS.map((market) => market.id);

  const [nationalSnapshots, feedRuns, reportSnapshots] = await Promise.all([
    marketIqPrisma.marketIqNationalSupplySnapshot.findMany({
      where: { cbsaCode: { in: trackedCodes }, snapshotDate: { gte: start } },
      orderBy: [{ snapshotDate: "desc" }, { marketName: "asc" }],
      select: {
        cbsaCode: true,
        snapshotDate: true,
        coverageStatus: true,
        sourceAvailableThrough: true,
        activeListings: true,
        capturedAt: true,
      },
    }),
    marketIqPrisma.marketIqListingFeedRun.findMany({
      where: { marketId: { in: liveMarketIds } },
      orderBy: { startedAt: "desc" },
      take: 40,
      select: {
        id: true,
        marketId: true,
        status: true,
        triggerKind: true,
        recordCount: true,
        sourceAvailableThrough: true,
        startedAt: true,
        completedAt: true,
        error: true,
      },
    }),
    marketIqPrisma.marketIqReportSourceSnapshot.findMany({
      where: { marketId: { in: liveMarketIds } },
      orderBy: { generatedAt: "desc" },
      select: { marketId: true, sourceAvailableThrough: true, generatedAt: true },
    }),
  ]);

  const nationalByMarket = new Map<string, typeof nationalSnapshots>();
  for (const snapshot of nationalSnapshots) {
    nationalByMarket.set(snapshot.cbsaCode, [...(nationalByMarket.get(snapshot.cbsaCode) ?? []), snapshot]);
  }
  const trackedMarkets = MARKET_IQ_TRACKED_MARKETS.map((market) => {
    const history = nationalByMarket.get(market.cbsaCode) ?? [];
    const latest = history[0] ?? null;
    const observed = new Set(history.map((snapshot) => dateKey(snapshot.snapshotDate)));
    const missingDates = dates.filter((date) => !observed.has(date));
    const status = !latest
      ? "missing"
      : latest.coverageStatus !== "eligible"
        ? "blocked"
        : dateKey(latest.snapshotDate) === today
          ? "current"
          : "stale";
    return {
      ...market,
      status,
      latestSnapshotDate: latest ? dateKey(latest.snapshotDate) : null,
      sourceAvailableThrough: latest?.sourceAvailableThrough ?? null,
      activeListings: latest?.activeListings ?? null,
      coverageStatus: latest?.coverageStatus ?? null,
      capturedAt: latest?.capturedAt ?? null,
      observedDays: observed.size,
      missingDates,
    };
  });

  const latestFeedByMarket = new Map<string, (typeof feedRuns)[number]>();
  for (const run of feedRuns) if (!latestFeedByMarket.has(run.marketId)) latestFeedByMarket.set(run.marketId, run);
  const latestReportByMarket = new Map<string, (typeof reportSnapshots)[number]>();
  for (const snapshot of reportSnapshots) if (!latestReportByMarket.has(snapshot.marketId)) latestReportByMarket.set(snapshot.marketId, snapshot);
  const launchedMarkets = MARKET_IQ_MARKETS.map((market) => {
    const feed = latestFeedByMarket.get(market.id) ?? null;
    const report = latestReportByMarket.get(market.id) ?? null;
    const feedCurrent = Boolean(
      feed
      && COMPLETE_FEED_STATUSES.has(feed.status)
      && dateKey(feed.completedAt ?? feed.startedAt) === today,
    );
    return {
      id: market.id,
      name: market.shortLabel,
      feedStatus: !feed ? "missing" : feed.status === "failed" ? "failed" : feedCurrent ? "current" : "stale",
      latestFeed: feed,
      latestReport: report,
    };
  });

  const dailyCoverage = dates.map((date) => {
    const rows = nationalSnapshots.filter((snapshot) => dateKey(snapshot.snapshotDate) === date);
    return {
      date,
      observed: new Set(rows.map((snapshot) => snapshot.cbsaCode)).size,
      eligible: rows.filter((snapshot) => snapshot.coverageStatus === "eligible").length,
    };
  });
  const currentMarkets = trackedMarkets.filter((market) => market.status === "current").length;
  const missingObservations = trackedMarkets.reduce((total, market) => total + market.missingDates.length, 0);

  return {
    checkedAt: now,
    historyDays: HISTORY_DAYS,
    currentMarkets,
    trackedMarketCount: MARKET_IQ_TRACKED_MARKETS.length,
    missingObservations,
    status: currentMarkets === MARKET_IQ_TRACKED_MARKETS.length && missingObservations === 0 ? "healthy" : "attention",
    trackedMarkets,
    launchedMarkets,
    dailyCoverage,
    recentFeedRuns: feedRuns.slice(0, 16),
  } as const;
}

