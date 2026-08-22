import { MARKET_IQ_REFRESH_STALE_AFTER_MS } from "@/lib/market-iq/report-refresh-reliability";
import {
  MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS,
  MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS,
} from "@/lib/market-iq/listing-feed";

export const MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS = 62;
export const MARKET_IQ_LISTING_REFRESH_STALE_AFTER_MS = 10 * 60 * 1_000;

export type MarketIqStablePreviewCheck = {
  id:
    | "market_iq_database"
    | "source_configuration"
    | "verified_snapshot"
    | "refresh_attempt"
    | "listing_snapshot"
    | "listing_refresh_attempt";
  status: "ready" | "blocked";
  detail: string;
};

export type MarketIqStablePreviewHealth = {
  product: "market-iq";
  status: "ready" | "blocked";
  checkedAt: string;
  marketId: string;
  sourceAvailableThrough: string | null;
  snapshotGeneratedAt: string | null;
  latestRefreshStatus: string | null;
  listingSourceAvailableThrough: string | null;
  listingSnapshotCapturedAt: string | null;
  latestListingRefreshStatus: string | null;
  checks: MarketIqStablePreviewCheck[];
};

const DAY_MILLISECONDS = 86_400_000;

function snapshotAgeDays(sourceAvailableThrough: Date, now: Date) {
  return Math.max(0, (now.getTime() - sourceAvailableThrough.getTime()) / DAY_MILLISECONDS);
}

function refreshAttemptDetail(
  refresh: { status: string; startedAt: Date; completedAt: Date | null } | null,
  ready: boolean,
) {
  if (!refresh) return "No authoritative Trends refresh failure is recorded.";
  if (refresh.status === "running") {
    if (refresh.completedAt) {
      return "The latest authoritative Trends refresh has an inconsistent recorded state.";
    }
    return ready
      ? "The authoritative Trends refresh is still within its expected running window."
      : "The authoritative Trends refresh has exceeded its expected running window.";
  }
  return ready
    ? "The latest recorded authoritative Trends refresh completed successfully."
    : "The latest recorded authoritative Trends refresh did not complete successfully.";
}

function listingRefreshAttemptDetail(
  refresh: { status: string; startedAt: Date; completedAt: Date | null } | null,
  ready: boolean,
) {
  if (!refresh) return "No active-listing feed capture is recorded.";
  if (refresh.status === "loading") {
    if (refresh.completedAt) {
      return "The latest active-listing feed capture has an inconsistent recorded state.";
    }
    return ready
      ? "The active-listing feed capture is still within its expected running window."
      : "The active-listing feed capture has exceeded its expected running window.";
  }
  return ready
    ? "The latest recorded active-listing feed capture completed successfully."
    : "The latest recorded active-listing feed capture did not complete successfully.";
}

export function resolveMarketIqStablePreviewHealth(input: {
  marketId: string;
  now: Date;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  sourceConfigured: boolean;
  snapshot: {
    sourceAvailableThrough: Date;
    generatedAt: Date;
    valid: boolean;
  } | null;
  latestRefresh: {
    status: string;
    startedAt: Date;
    completedAt: Date | null;
  } | null;
  listingSnapshot: {
    sourceAvailableThrough: Date;
    capturedAt: Date;
    activeListings: number;
    apartmentListings: number;
    houseListings: number;
    ageObservedListings: number;
  } | null;
  latestListingRefresh: {
    status: string;
    startedAt: Date;
    completedAt: Date | null;
  } | null;
}): MarketIqStablePreviewHealth {
  const snapshotCurrent = Boolean(
    input.snapshot?.valid
      && snapshotAgeDays(input.snapshot.sourceAvailableThrough, input.now)
        <= MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS,
  );
  const refreshAgeMilliseconds = input.latestRefresh
    ? input.now.getTime() - input.latestRefresh.startedAt.getTime()
    : null;
  const refreshAttemptReady = input.latestRefresh === null
    || (
      input.latestRefresh.status === "complete"
      && input.latestRefresh.completedAt !== null
    )
    || (
      input.latestRefresh.status === "running"
      && input.latestRefresh.completedAt === null
      && refreshAgeMilliseconds !== null
      && refreshAgeMilliseconds >= 0
      && refreshAgeMilliseconds <= MARKET_IQ_REFRESH_STALE_AFTER_MS
    );
  const listingSnapshotReady = Boolean(
    input.listingSnapshot
      && input.now.getTime() >= input.listingSnapshot.sourceAvailableThrough.getTime()
      && input.now.getTime() >= input.listingSnapshot.capturedAt.getTime()
      && input.now.getTime() - input.listingSnapshot.sourceAvailableThrough.getTime()
        <= MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS
      && input.now.getTime() - input.listingSnapshot.capturedAt.getTime()
        <= MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS
      && input.listingSnapshot.activeListings >= MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS
      && input.listingSnapshot.apartmentListings + input.listingSnapshot.houseListings
        === input.listingSnapshot.activeListings
      && input.listingSnapshot.ageObservedListings >= 0
      && input.listingSnapshot.ageObservedListings <= input.listingSnapshot.activeListings,
  );
  const listingRefreshAgeMilliseconds = input.latestListingRefresh
    ? input.now.getTime() - input.latestListingRefresh.startedAt.getTime()
    : null;
  const listingRefreshReady = Boolean(
    input.latestListingRefresh
      && (
        (
          ["complete", "baseline_complete"].includes(input.latestListingRefresh.status)
          && input.latestListingRefresh.completedAt !== null
        )
        || (
          input.latestListingRefresh.status === "loading"
          && input.latestListingRefresh.completedAt === null
          && listingRefreshAgeMilliseconds !== null
          && listingRefreshAgeMilliseconds >= 0
          && listingRefreshAgeMilliseconds <= MARKET_IQ_LISTING_REFRESH_STALE_AFTER_MS
        )
      ),
  );
  const checks: MarketIqStablePreviewCheck[] = [
    {
      id: "market_iq_database",
      status: input.databaseConfigured && input.databaseReachable ? "ready" : "blocked",
      detail: input.databaseConfigured && input.databaseReachable
        ? "The isolated Market IQ evidence store is reachable."
        : "The isolated Market IQ evidence store is unavailable.",
    },
    {
      id: "source_configuration",
      status: input.sourceConfigured ? "ready" : "blocked",
      detail: input.sourceConfigured
        ? "The read-only Trends source is configured."
        : "The read-only Trends source is not configured.",
    },
    {
      id: "verified_snapshot",
      status: snapshotCurrent ? "ready" : "blocked",
      detail: snapshotCurrent
        ? "A current, structurally valid Trends snapshot is available."
        : "A current, structurally valid Trends snapshot is not available.",
    },
    {
      id: "refresh_attempt",
      status: refreshAttemptReady ? "ready" : "blocked",
      detail: refreshAttemptDetail(input.latestRefresh, refreshAttemptReady),
    },
    {
      id: "listing_snapshot",
      status: listingSnapshotReady ? "ready" : "blocked",
      detail: listingSnapshotReady
        ? "A current, structurally valid active-listing supply snapshot is available."
        : "A current, structurally valid active-listing supply snapshot is not available.",
    },
    {
      id: "listing_refresh_attempt",
      status: listingRefreshReady ? "ready" : "blocked",
      detail: listingRefreshAttemptDetail(input.latestListingRefresh, listingRefreshReady),
    },
  ];

  return {
    product: "market-iq",
    status: checks.every((check) => check.status === "ready") ? "ready" : "blocked",
    checkedAt: input.now.toISOString(),
    marketId: input.marketId,
    sourceAvailableThrough: input.snapshot?.sourceAvailableThrough.toISOString() ?? null,
    snapshotGeneratedAt: input.snapshot?.generatedAt.toISOString() ?? null,
    latestRefreshStatus: input.latestRefresh?.status ?? null,
    listingSourceAvailableThrough: input.listingSnapshot?.sourceAvailableThrough.toISOString() ?? null,
    listingSnapshotCapturedAt: input.listingSnapshot?.capturedAt.toISOString() ?? null,
    latestListingRefreshStatus: input.latestListingRefresh?.status ?? null,
    checks,
  };
}
