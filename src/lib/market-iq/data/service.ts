import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import { emptyListingSupplySummary } from "@/lib/market-iq/listing-supply";
import { assessMarketIqReportQuality, hasLongMsaHistory } from "./quality";
import type {
  MarketIqListingPulse,
  MarketIqMarketDataAdapter,
  MarketIqMarketDataRepository,
  MarketIqMarketDataResult,
} from "./types";

function timeoutAfter<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The source did not respond in time.")), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function unavailableMarketIqListingPulse(marketName: string): MarketIqListingPulse {
  return {
    ...emptyListingSupplySummary(),
    status: "unavailable",
    sourceName: "Dwellsy production listing database",
    sourceAvailableThrough: null,
    activeListings: 0,
    apartmentListings: 0,
    houseListings: 0,
    newEvents: 0,
    relistedEvents: 0,
    reactivatedEvents: 0,
    priceChangeEvents: 0,
    deactivatedEvents: 0,
    message: `Current ${marketName} listing activity is refreshing. The saved rent analysis remains available.`,
  };
}

export async function loadMarketIqMarketDataWithDependencies(input: {
  market: MarketIqMarketDefinition;
  adapter: MarketIqMarketDataAdapter;
  repository: MarketIqMarketDataRepository;
  refreshReport?: boolean;
  now?: Date;
  reportTimeoutMs?: number;
  listingTimeoutMs?: number;
}): Promise<MarketIqMarketDataResult> {
  const persisted = await input.repository.loadPersistedReport(input.market.id);
  let report = persisted;
  let usedPersistedSnapshot = Boolean(persisted);
  let refreshFailed = false;

  if (input.refreshReport !== false && (!persisted || !hasLongMsaHistory(persisted))) {
    try {
      report = await timeoutAfter(input.adapter.loadReport(), input.reportTimeoutMs ?? 8_000);
      await input.repository.storeReport(report);
      usedPersistedSnapshot = false;
    } catch (error) {
      refreshFailed = true;
      console.warn("Market IQ could not refresh a market source snapshot.", {
        marketId: input.market.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let listingPulse: MarketIqListingPulse;
  try {
    listingPulse = await timeoutAfter(input.adapter.loadListingPulse(), input.listingTimeoutMs ?? 3_000);
  } catch {
    listingPulse = unavailableMarketIqListingPulse(input.market.shortLabel);
  }

  const quality = assessMarketIqReportQuality({ report, now: input.now });
  const issues = [...quality.issues];
  if (refreshFailed) {
    issues.push({
      code: "refresh_failed",
      message: report
        ? "The live refresh failed, so the latest saved Trends IQ snapshot is shown."
        : "The live Trends IQ refresh failed and no saved snapshot is available.",
    });
  }
  if (listingPulse.status === "unavailable") {
    issues.push({ code: "listing_unavailable", message: listingPulse.message });
  }

  return {
    market: input.market,
    report,
    listingPulse,
    freshness: quality.freshness,
    sourceAvailableThrough: quality.sourceAvailableThrough,
    issues,
    usedPersistedSnapshot,
  };
}
