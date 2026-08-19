import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { loadMarketActiveListings } from "@/lib/dwellsy-source/active-listings.server";
import {
  emptyListingSupplySummary,
  summarizeActiveListingSupply,
  type ListingSupplySummary,
} from "@/lib/market-iq/listing-supply";

export type ClevelandLiveListingPulse = ListingSupplySummary & {
  status: "healthy" | "unavailable";
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

export async function loadDirectMarketListingPulse(input: {
  marketName: string;
  msaCode: string;
}): Promise<ClevelandLiveListingPulse> {
  try {
    const source = await loadMarketActiveListings(input.msaCode);
    const apartmentListings = source.listings.filter((listing) => listing.propertyType === "apartment").length;
    const houseListings = source.listings.length - apartmentListings;
    const supply = summarizeActiveListingSupply(source.listings, source.sourceAvailableThrough);
    return {
      ...supply,
      status: "healthy",
      sourceName: "Dwellsy production listing database",
      sourceAvailableThrough: source.sourceAvailableThrough,
      activeListings: source.listings.length,
      apartmentListings,
      houseListings,
      newEvents: 0,
      relistedEvents: 0,
      reactivatedEvents: 0,
      priceChangeEvents: 0,
      deactivatedEvents: 0,
      message: `Current ${input.marketName} listings are read directly from Dwellsy. Snapshot-based event counts begin after the first synchronized refresh.`,
    };
  } catch {
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
      message: `Current ${input.marketName} listing inventory is temporarily unavailable. No substitute records are shown.`,
    };
  }
}

export async function loadClevelandLiveListingPulse(): Promise<ClevelandLiveListingPulse> {
  const [runResult, sourceResult] = await Promise.allSettled([
    marketIqPrisma.marketIqListingFeedRun.findFirst({
      where: {
        marketId: CLEVELAND_MARKET_ID,
        status: { in: ["complete", "baseline_complete"] },
      },
      orderBy: { completedAt: "desc" },
    }),
    loadMarketActiveListings("17460"),
  ]);
  const run = runResult.status === "fulfilled" ? runResult.value : null;
  const source = sourceResult.status === "fulfilled" ? sourceResult.value : null;

  if (!run && !source) {
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
      message: "Current Cleveland listing inventory is temporarily unavailable. No substitute records are shown.",
    };
  }

  const apartmentListings = source
    ? source.listings.filter((listing) => listing.propertyType === "apartment").length
    : run?.apartmentCount ?? 0;
  const houseListings = source ? source.listings.length - apartmentListings : run?.houseCount ?? 0;
  const supply = source
    ? summarizeActiveListingSupply(source.listings, source.sourceAvailableThrough)
    : emptyListingSupplySummary();
  return {
    ...supply,
    status: "healthy",
    sourceName: "Dwellsy production listing database",
    sourceAvailableThrough: source?.sourceAvailableThrough ?? run?.sourceAvailableThrough ?? null,
    activeListings: source?.listings.length ?? run?.recordCount ?? 0,
    apartmentListings,
    houseListings,
    newEvents: run?.newCount ?? 0,
    relistedEvents: run?.relistedCount ?? 0,
    reactivatedEvents: run?.reactivatedCount ?? 0,
    priceChangeEvents: run?.priceChangeCount ?? 0,
    deactivatedEvents: run?.deactivatedCount ?? 0,
    message: !run
      ? "Current Cleveland inventory and active-listing age are read directly from Dwellsy. Event counts begin after the next synchronized snapshot."
      : run.status === "baseline_complete"
        ? "The first direct listing snapshot is complete. Event detection begins with the next successful snapshot."
        : "Current listings and listing events are synchronized from Dwellsy through a read-only connection.",
  };
}
