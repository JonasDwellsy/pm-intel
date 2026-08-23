import {
  MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS,
  MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS,
} from "@/lib/market-iq/listing-feed";
import { emptyListingSupplySummary, type ListingAgeBucket } from "@/lib/market-iq/listing-supply";
import type { MarketIqListingPulse } from "@/lib/market-iq/data/types";

const SOURCE_NAME = "Persisted Dwellsy listing supply snapshot";

type UnavailableReason = Exclude<MarketIqListingPulse["unavailableReason"], null>;

export type PersistedMarketIqListingSupplySnapshot = {
  sourceAvailableThrough: Date | null;
  capturedAt: Date;
  activeListings: number;
  apartmentListings: number;
  houseListings: number;
  ageObservedListings: number;
  medianActiveAgeDays: number | null;
  activeOver30Days: number;
  activeOver30SharePct: number | null;
  activatedLast7Days: number;
  activatedLast30Days: number;
  age0To7Days: number;
  age8To14Days: number;
  age15To30Days: number;
  age31To60Days: number;
  age61PlusDays: number;
  feedRun?: {
    status: string;
    newCount: number;
    relistedCount: number;
    reactivatedCount: number;
    priceChangeCount: number;
    deactivatedCount: number;
  };
};

export function unavailablePersistedMarketListingPulse(input: {
  marketName: string;
  attemptedAt: Date;
  reason: UnavailableReason;
}): MarketIqListingPulse {
  const explanation = input.reason === "missing"
    ? "No persisted listing-supply snapshot has been captured for this market."
    : input.reason === "stale"
      ? "The latest persisted listing-supply snapshot is too old to present as current evidence."
      : input.reason === "invalid"
        ? "The latest persisted listing-supply snapshot failed its completeness checks."
        : "The persisted listing-supply snapshot could not be read.";
  return {
    ...emptyListingSupplySummary(),
    status: "unavailable",
    unavailableReason: input.reason,
    attemptedAt: input.attemptedAt,
    sourceName: SOURCE_NAME,
    sourceAvailableThrough: null,
    activeListings: 0,
    apartmentListings: 0,
    houseListings: 0,
    eventCountsAvailable: false,
    newEvents: 0,
    relistedEvents: 0,
    reactivatedEvents: 0,
    priceChangeEvents: 0,
    deactivatedEvents: 0,
    message: `${input.marketName} inventory is unavailable. ${explanation} No substitute records are shown.`,
  };
}

function bucket(key: ListingAgeBucket["key"], label: string, count: number, total: number): ListingAgeBucket {
  return { key, label, count, sharePct: total > 0 ? Math.round((count / total) * 1_000) / 10 : 0 };
}

export function resolvePersistedMarketListingPulse(input: {
  marketName: string;
  now: Date;
  snapshot: PersistedMarketIqListingSupplySnapshot | null;
}): MarketIqListingPulse {
  const snapshot = input.snapshot;
  if (!snapshot) return unavailablePersistedMarketListingPulse({ marketName: input.marketName, attemptedAt: input.now, reason: "missing" });
  if (!snapshot.sourceAvailableThrough) {
    return unavailablePersistedMarketListingPulse({ marketName: input.marketName, attemptedAt: input.now, reason: "stale" });
  }
  const sourceAge = input.now.getTime() - snapshot.sourceAvailableThrough.getTime();
  const captureAge = input.now.getTime() - snapshot.capturedAt.getTime();
  if (sourceAge < 0 || captureAge < 0
    || sourceAge > MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS
    || captureAge > MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS) {
    return unavailablePersistedMarketListingPulse({ marketName: input.marketName, attemptedAt: input.now, reason: "stale" });
  }
  const valid = (!snapshot.feedRun || ["complete", "baseline_complete"].includes(snapshot.feedRun.status))
    && snapshot.activeListings >= MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS
    && snapshot.apartmentListings + snapshot.houseListings === snapshot.activeListings
    && snapshot.ageObservedListings >= 0
    && snapshot.ageObservedListings <= snapshot.activeListings
    && snapshot.age0To7Days + snapshot.age8To14Days + snapshot.age15To30Days
      + snapshot.age31To60Days + snapshot.age61PlusDays === snapshot.ageObservedListings
    && snapshot.activeOver30Days === snapshot.age31To60Days + snapshot.age61PlusDays;
  if (!valid) return unavailablePersistedMarketListingPulse({ marketName: input.marketName, attemptedAt: input.now, reason: "invalid" });
  const ageTotal = snapshot.ageObservedListings;
  return {
    status: "healthy",
    unavailableReason: null,
    attemptedAt: null,
    sourceName: SOURCE_NAME,
    sourceAvailableThrough: snapshot.sourceAvailableThrough,
    activeListings: snapshot.activeListings,
    apartmentListings: snapshot.apartmentListings,
    houseListings: snapshot.houseListings,
    eventCountsAvailable: Boolean(snapshot.feedRun),
    ageObservedListings: ageTotal,
    medianActiveAgeDays: snapshot.medianActiveAgeDays,
    activeOver30Days: snapshot.activeOver30Days,
    activeOver30SharePct: snapshot.activeOver30SharePct,
    activatedLast7Days: snapshot.activatedLast7Days,
    activatedLast30Days: snapshot.activatedLast30Days,
    listingAgeBuckets: [
      bucket("0_7", "0–7", snapshot.age0To7Days, ageTotal),
      bucket("8_14", "8–14", snapshot.age8To14Days, ageTotal),
      bucket("15_30", "15–30", snapshot.age15To30Days, ageTotal),
      bucket("31_60", "31–60", snapshot.age31To60Days, ageTotal),
      bucket("61_plus", "61+", snapshot.age61PlusDays, ageTotal),
    ],
    newEvents: snapshot.feedRun?.newCount ?? 0,
    relistedEvents: snapshot.feedRun?.relistedCount ?? 0,
    reactivatedEvents: snapshot.feedRun?.reactivatedCount ?? 0,
    priceChangeEvents: snapshot.feedRun?.priceChangeCount ?? 0,
    deactivatedEvents: snapshot.feedRun?.deactivatedCount ?? 0,
    message: `Current ${input.marketName} inventory and listing age come from the latest verified nightly snapshot.`,
  };
}
