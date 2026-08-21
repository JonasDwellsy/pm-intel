import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { loadClevelandActiveListings } from "@/lib/dwellsy-source/active-listings.server";
import {
  classifyListingFeedChanges,
  listingEventFingerprint,
  listingFeedEventCounts,
} from "@/lib/market-iq/listing-feed";
import { summarizeDailyActiveListingSupply } from "@/lib/market-iq/listing-supply";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

const HEALTHY_BASELINE_MINIMUM = 250;
const MINIMUM_PRIOR_COVERAGE = 0.7;
const MAXIMUM_SOURCE_AGE_MS = 48 * 60 * 60 * 1_000;
const COMPLETE_STATUSES = ["complete", "baseline_complete"];

export async function runClevelandListingFeed(input: {
  triggerKind: "manual" | "scheduled";
  startedBy?: string;
}) {
  const run = await marketIqPrisma.marketIqListingFeedRun.create({
    data: {
      marketId: CLEVELAND_MARKET_ID,
      triggerKind: input.triggerKind,
      startedBy: input.startedBy,
    },
  });

  try {
    const previousRun = await marketIqPrisma.marketIqListingFeedRun.findFirst({
      where: { marketId: CLEVELAND_MARKET_ID, status: { in: COMPLETE_STATUSES } },
      orderBy: { completedAt: "desc" },
      include: { snapshots: true },
    });
    const source = await loadClevelandActiveListings();
    if (Date.now() - source.sourceAvailableThrough.getTime() > MAXIMUM_SOURCE_AGE_MS) {
      throw new Error("The Dwellsy active-listing snapshot is more than 48 hours old; synchronization stopped.");
    }
    const uniqueListingIds = new Set(source.listings.map((listing) => listing.sourceListingId));
    if (uniqueListingIds.size !== source.listings.length) {
      throw new Error("Dwellsy returned duplicate active listing IDs; snapshot rejected.");
    }
    const requiredCount = previousRun
      ? Math.max(HEALTHY_BASELINE_MINIMUM, Math.floor(previousRun.recordCount * MINIMUM_PRIOR_COVERAGE))
      : HEALTHY_BASELINE_MINIMUM;
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
            marketId: CLEVELAND_MARKET_ID,
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

    await marketIqPrisma.$transaction([
      marketIqPrisma.marketIqLiveListingSnapshot.createMany({
        data: source.listings.map((listing) => ({
          runId: run.id,
          marketId: CLEVELAND_MARKET_ID,
          ...listing,
        })),
      }),
      marketIqPrisma.marketIqListingEvent.createMany({
        data: events.map((event) => ({
          fingerprint: listingEventFingerprint({ marketId: CLEVELAND_MARKET_ID, runId: run.id, event }),
          runId: run.id,
          marketId: CLEVELAND_MARKET_ID,
          ...event,
          metadata: JSON.stringify({ source: "dwellsy_prod.active_listing_table" }),
        })),
        skipDuplicates: true,
      }),
      marketIqPrisma.marketIqListingSupplySnapshot.upsert({
        where: {
          marketId_snapshotDate: {
            marketId: CLEVELAND_MARKET_ID,
            snapshotDate: supply.snapshotDate,
          },
        },
        create: {
          marketId: CLEVELAND_MARKET_ID,
          snapshotDate: supply.snapshotDate,
          ...supplySnapshot,
        },
        update: supplySnapshot,
      }),
      marketIqPrisma.marketIqListingFeedRun.update({
        where: { id: run.id },
        data: {
          status: previousRun ? "complete" : "baseline_complete",
          sourceAvailableThrough: source.sourceAvailableThrough,
          recordCount: supply.activeListings,
          apartmentCount: supply.apartmentListings,
          houseCount: supply.houseListings,
          ...eventCounts,
          completedAt,
        },
      }),
    ]);

    return {
      runId: run.id,
      status: previousRun ? "complete" : "baseline_complete",
      sourceAvailableThrough: source.sourceAvailableThrough,
      recordCount: supply.activeListings,
      apartmentCount: supply.apartmentListings,
      houseCount: supply.houseListings,
      ...eventCounts,
    };
  } catch (error) {
    await marketIqPrisma.marketIqListingFeedRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 4_000),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
