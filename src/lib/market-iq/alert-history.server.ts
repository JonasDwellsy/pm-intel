import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { marketIqAlertMatchesWatchlist, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";
import { prisma } from "@/lib/prisma";

export interface MarketIqAlertHistoryItem {
  id: string;
  severity: string;
  headline: string;
  narrative: string;
  observedMonth: string;
  geographyLabel: string;
  segmentLabel: string;
  watchlistNames: string[];
}

function geographyLabel(type: string, value: string) {
  if (type === "msa") return "Cleveland–Elyria, OH";
  if (type === "zip") return `ZIP ${value}`;
  return value.replace(/, OH$/, "");
}

function segmentLabel(propertyType: string, bedrooms: number) {
  const bedroomsLabel = bedrooms === 0 ? "Studio" : `${bedrooms}-bed`;
  return `${bedroomsLabel} ${propertyType}`;
}

export async function loadMarketIqAlertHistory(watchlists: MarketIqWatchlistView[]) {
  if (!watchlists.length) return [];
  const alerts = await prisma.marketIqAlert.findMany({
    where: { marketId: CLEVELAND_MARKET_ID },
    orderBy: [{ observedMonth: "desc" }, { createdAt: "desc" }],
    take: 150,
  });
  return alerts.flatMap((alert): MarketIqAlertHistoryItem[] => {
    const matching = watchlists.filter((watchlist) =>
      marketIqAlertMatchesWatchlist(alert, watchlist)
    );
    if (!matching.length) return [];
    return [{
      id: alert.id,
      severity: alert.severity,
      headline: alert.headline,
      narrative: alert.narrative,
      observedMonth: alert.observedMonth.toISOString(),
      geographyLabel: geographyLabel(alert.geographyType, alert.geographyValue),
      segmentLabel: segmentLabel(alert.propertyType, alert.bedrooms),
      watchlistNames: matching.map((watchlist) => watchlist.name),
    }];
  }).sort((a, b) =>
    b.observedMonth.localeCompare(a.observedMonth) ||
    Number(b.severity === "material") - Number(a.severity === "material")
  ).slice(0, 50);
}
