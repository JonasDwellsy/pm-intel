import "server-only";
import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import { loadMarketActiveListings } from "@/lib/dwellsy-source/active-listings.server";
import {
  classifyListingFeedChanges,
  listingEventFingerprint,
  listingFeedEventCounts,
  MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS,
  MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS,
} from "@/lib/market-iq/listing-feed";
import {
  marketIqListingFeedStaleBefore,
  MarketIqListingFeedAlreadyRunningError,
  MarketIqListingFeedOperationFailedError,
} from "@/lib/market-iq/listing-feed-reliability";
import { summarizeDailyActiveListingSupply } from "@/lib/market-iq/listing-supply";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

const MINIMUM_PRIOR_COVERAGE = 0.7;
const COMPLETE_STATUSES = ["complete", "baseline_complete"];

type ListingFeedRunResult = {
  runId: string;
  marketId: string;
  status: string;
  sourceAvailableThrough: Date;
  recordCount: number;
  apartmentCount: number;
  houseCount: number;
  newCount: number;
  relistedCount: number;
  reactivatedCount: number;
  priceChangeCount: number;
  deactivatedCount: number;
  reused?: boolean;
};

type ListingFeedRunRecord = Omit<ListingFeedRunResult, "runId" | "reused" | "sourceAvailableThrough"> & {
  id: string;
  sourceAvailableThrough: Date | null;
};

function completedRunResult(run: ListingFeedRunRecord): ListingFeedRunResult | null {
  if (!COMPLETE_STATUSES.includes(run.status) || !run.sourceAvailableThrough) return null;
  return {
    runId: run.id,
    marketId: run.marketId,
    status: run.status,
    sourceAvailableThrough: run.sourceAvailableThrough,
    recordCount: run.recordCount,
    apartmentCount: run.apartmentCount,
    houseCount: run.houseCount,
    newCount: run.newCount,
    relistedCount: run.relistedCount,
    reactivatedCount: run.reactivatedCount,
    priceChangeCount: run.priceChangeCount,
    deactivatedCount: run.deactivatedCount,
    reused: true,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function existingRunOutcome(marketId: string, operationKey?: string): Promise<ListingFeedRunResult | null> {
  const existing = operationKey
    ? await marketIqPrisma.marketIqListingFeedRun.findUnique({ where: { operationKey } })
    : null;
  if (existing && existing.marketId !== marketId) throw new MarketIqListingFeedOperationFailedError();
  const completed = existing ? completedRunResult(existing) : null;
  if (completed) return completed;
  if (existing?.status === "loading") throw new MarketIqListingFeedAlreadyRunningError();
  if (existing) throw new MarketIqListingFeedOperationFailedError();

  const active = await marketIqPrisma.marketIqListingFeedRun.findFirst({
    where: { marketId, status: "loading" },
    select: { id: true },
  });
  if (active) throw new MarketIqListingFeedAlreadyRunningError();
  return null;
}

async function beginMarketIqListingFeedRun(input: {
  marketId: string;
  triggerKind: "manual" | "scheduled";
  startedBy?: string;
  operationKey?: string;
  now: Date;
}) {
  const staleBefore = marketIqListingFeedStaleBefore(input.now);
  await marketIqPrisma.marketIqListingFeedRun.updateMany({
    where: {
      marketId: input.marketId,
      status: "loading",
      startedAt: { lt: staleBefore },
    },
    data: {
      status: "failed",
      error: "The listing refresh exceeded its ten-minute lease and was closed before a later run started.",
      completedAt: input.now,
    },
  });

  const replay = await existingRunOutcome(input.marketId, input.operationKey);
  if (replay) return { state: "reused" as const, result: replay };

  try {
    const run = await marketIqPrisma.marketIqListingFeedRun.create({
      data: {
        marketId: input.marketId,
        operationKey: input.operationKey,
        triggerKind: input.triggerKind,
        startedBy: input.startedBy,
        startedAt: input.now,
      },
    });
    return { state: "acquired" as const, run };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrentReplay = await existingRunOutcome(input.marketId, input.operationKey);
    if (concurrentReplay) return { state: "reused" as const, result: concurrentReplay };
    throw new MarketIqListingFeedAlreadyRunningError();
  }
}

export async function runMarketIqListingFeed(input: {
  market: MarketIqMarketDefinition;
  triggerKind: "manual" | "scheduled";
  startedBy?: string;
  operationKey?: string;
  now?: Date;
}) {
  const lease = await beginMarketIqListingFeedRun({
    marketId: input.market.id,
    triggerKind: input.triggerKind,
    startedBy: input.startedBy,
    operationKey: input.operationKey,
    now: input.now ?? new Date(),
  });
  if (lease.state === "reused") return lease.result;
  const run = lease.run;

  try {
    const previousRun = await marketIqPrisma.marketIqListingFeedRun.findFirst({
      where: { marketId: input.market.id, status: { in: COMPLETE_STATUSES } },
      orderBy: { completedAt: "desc" },
      include: { snapshots: true },
    });
    const source = await loadMarketActiveListings(input.market.cbsaCode);
    if (Date.now() - source.sourceAvailableThrough.getTime() > MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS) {
      throw new Error("The Dwellsy active-listing snapshot is more than 48 hours old; synchronization stopped.");
    }
    const uniqueListingIds = new Set(source.listings.map((listing) => listing.sourceListingId));
    if (uniqueListingIds.size !== source.listings.length) {
      throw new Error("Dwellsy returned duplicate active listing IDs; snapshot rejected.");
    }
    const requiredCount = previousRun
      ? Math.max(MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS, Math.floor(previousRun.recordCount * MINIMUM_PRIOR_COVERAGE))
      : MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS;
    if (source.listings.length < requiredCount) {
      throw new Error(
        `Dwellsy returned ${source.listings.length} listings; at least ${requiredCount} are required before deactivation events can be trusted.`
      );
    }

    const previous = previousRun?.snapshots ?? [];
    const previousIds = new Set(previous.map((listing) => listing.sourceListingId));
    const currentOnly = source.listings.filter((listing) => !previousIds.has(listing.sourceListingId));
    const history = previousRun && currentOnly.length
      ? await marketIqPrisma.marketIqLiveListingSnapshot.findMany({
          where: {
            marketId: input.market.id,
            OR: [
              { sourceListingId: { in: currentOnly.map((listing) => listing.sourceListingId) } },
              { sourcePropertyId: { in: currentOnly.map((listing) => listing.sourcePropertyId) } },
            ],
          },
          select: { sourceListingId: true, sourcePropertyId: true },
        })
      : [];
    const events = classifyListingFeedChanges({
      previous,
      current: source.listings,
      historicallySeenListingIds: new Set(history.map((listing) => listing.sourceListingId)),
      historicallySeenPropertyIds: new Set(history.map((listing) => listing.sourcePropertyId)),
      baseline: !previousRun,
    });
    const eventCounts = listingFeedEventCounts(events);
    const completedAt = new Date();
    const supply = summarizeDailyActiveListingSupply(source.listings, completedAt);
    const bucketCounts = Object.fromEntries(
      supply.listingAgeBuckets.map((bucket) => [bucket.key, bucket.count]),
    );
    const supplySnapshot = {
      feedRunId: run.id,
      sourceAvailableThrough: source.sourceAvailableThrough,
      activeListings: supply.activeListings,
      apartmentListings: supply.apartmentListings,
      houseListings: supply.houseListings,
      ageObservedListings: supply.ageObservedListings,
      medianActiveAgeDays: supply.medianActiveAgeDays,
      activeOver30Days: supply.activeOver30Days,
      activeOver30SharePct: supply.activeOver30SharePct,
      activatedLast7Days: supply.activatedLast7Days,
      activatedLast30Days: supply.activatedLast30Days,
      age0To7Days: bucketCounts["0_7"] ?? 0,
      age8To14Days: bucketCounts["8_14"] ?? 0,
      age15To30Days: bucketCounts["15_30"] ?? 0,
      age31To60Days: bucketCounts["31_60"] ?? 0,
      age61PlusDays: bucketCounts["61_plus"] ?? 0,
      capturedAt: completedAt,
    };

    await marketIqPrisma.$transaction(async (transaction) => {
      const completed = await transaction.marketIqListingFeedRun.updateMany({
        where: { id: run.id, status: "loading" },
        data: {
          status: previousRun ? "complete" : "baseline_complete",
          sourceAvailableThrough: source.sourceAvailableThrough,
          recordCount: supply.activeListings,
          apartmentCount: supply.apartmentListings,
          houseCount: supply.houseListings,
          ...eventCounts,
          completedAt,
        },
      });
      if (completed.count !== 1) {
        throw new Error("The active Market IQ listing-feed lease was lost before persistence.");
      }

      await transaction.marketIqLiveListingSnapshot.createMany({
        data: source.listings.map((listing) => ({
          runId: run.id,
          marketId: input.market.id,
          ...listing,
        })),
      });
      await transaction.marketIqListingEvent.createMany({
        data: events.map((event) => ({
          fingerprint: listingEventFingerprint({ marketId: input.market.id, runId: run.id, event }),
          runId: run.id,
          marketId: input.market.id,
          ...event,
          metadata: JSON.stringify({ source: "dwellsy_prod.active_listing_table" }),
        })),
        skipDuplicates: true,
      });
      await transaction.marketIqListingSupplySnapshot.upsert({
        where: {
          marketId_snapshotDate: {
            marketId: input.market.id,
            snapshotDate: supply.snapshotDate,
          },
        },
        create: {
          marketId: input.market.id,
          snapshotDate: supply.snapshotDate,
          ...supplySnapshot,
        },
        update: supplySnapshot,
      });
    }, { maxWait: 5_000, timeout: 30_000 });

    return {
      runId: run.id,
      marketId: input.market.id,
      status: previousRun ? "complete" : "baseline_complete",
      sourceAvailableThrough: source.sourceAvailableThrough,
      recordCount: supply.activeListings,
      apartmentCount: supply.apartmentListings,
      houseCount: supply.houseListings,
      ...eventCounts,
    };
  } catch (error) {
    await marketIqPrisma.marketIqListingFeedRun.updateMany({
      where: { id: run.id, status: "loading" },
      data: {
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 4_000),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
