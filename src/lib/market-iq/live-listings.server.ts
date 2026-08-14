import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

export type ClevelandLiveListingPulse = {
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

export async function loadClevelandLiveListingPulse(): Promise<ClevelandLiveListingPulse> {
  const run = await marketIqPrisma.marketIqListingFeedRun.findFirst({
    where: {
      marketId: CLEVELAND_MARKET_ID,
      status: { in: ["complete", "baseline_complete"] },
    },
    orderBy: { completedAt: "desc" },
  });
  if (!run) {
    return {
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
      message: "The direct read-only source is configured, but no complete Cleveland snapshot has been synchronized yet.",
    };
  }
  return {
    status: "healthy",
    sourceName: "Dwellsy production listing database",
    sourceAvailableThrough: run.sourceAvailableThrough,
    activeListings: run.recordCount,
    apartmentListings: run.apartmentCount,
    houseListings: run.houseCount,
    newEvents: run.newCount,
    relistedEvents: run.relistedCount,
    reactivatedEvents: run.reactivatedCount,
    priceChangeEvents: run.priceChangeCount,
    deactivatedEvents: run.deactivatedCount,
    message: run.status === "baseline_complete"
      ? "The first direct listing snapshot is complete. Event detection begins with the next successful snapshot."
      : "Current listings and listing events are synchronized from Dwellsy through a read-only connection.",
  };
}
