import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { loadClevelandActiveListings } from "@/lib/dwellsy-source/active-listings.server";
import {
  classifyListingFeedChanges,
  listingEventFingerprint,
  listingFeedEventCounts,
} from "@/lib/market-iq/listing-feed";
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
    const apartmentCount = source.listings.filter((listing) => listing.propertyType === "apartment").length;
    const houseCount = source.listings.length - apartmentCount;

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
      marketIqPrisma.marketIqListingFeedRun.update({
        where: { id: run.id },
        data: {
          status: previousRun ? "complete" : "baseline_complete",
          sourceAvailableThrough: source.sourceAvailableThrough,
          recordCount: source.listings.length,
          apartmentCount,
          houseCount,
          ...eventCounts,
          completedAt,
        },
      }),
    ]);

    return {
      runId: run.id,
      status: previousRun ? "complete" : "baseline_complete",
      sourceAvailableThrough: source.sourceAvailableThrough,
      recordCount: source.listings.length,
      apartmentCount,
      houseCount,
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
