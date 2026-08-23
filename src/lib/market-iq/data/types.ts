import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import type { ListingSupplySummary } from "@/lib/market-iq/listing-supply";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export type MarketIqDataFreshness = "current" | "stale" | "missing";

export type MarketIqDataIssueCode =
  | "refresh_failed"
  | "partial_history"
  | "stale_snapshot"
  | "listing_unavailable";

export type MarketIqDataIssue = {
  code: MarketIqDataIssueCode;
  message: string;
};

export type MarketIqListingPulse = ListingSupplySummary & {
  status: "healthy" | "unavailable";
  unavailableReason: "missing" | "stale" | "invalid" | "read_failed" | null;
  attemptedAt: Date | null;
  sourceName: string;
  sourceAvailableThrough: Date | null;
  activeListings: number;
  apartmentListings: number;
  houseListings: number;
  newEvents: number;
  relistedEvents: number;
  reactivatedEvents: number;
  priceChangeEvents: number;
  deactivatedEvents: number;
  message: string;
};

export type MarketIqMarketDataResult = {
  market: MarketIqMarketDefinition;
  report: MarketIqReportSnapshot | null;
  listingPulse: MarketIqListingPulse;
  freshness: MarketIqDataFreshness;
  sourceAvailableThrough: string | null;
  issues: MarketIqDataIssue[];
  usedPersistedSnapshot: boolean;
};

export type MarketIqMarketDataAdapter = {
  marketId: string;
  loadReport: () => Promise<MarketIqReportSnapshot>;
  loadListingPulse: () => Promise<MarketIqListingPulse>;
};

export type MarketIqMarketDataRepository = {
  loadPersistedReport: (marketId: string) => Promise<MarketIqReportSnapshot | null>;
  storeReport: (report: MarketIqReportSnapshot) => Promise<unknown>;
};
