import { CLEVELAND_MARKET_ID, getMarketIqMarket, listEntitledMarketIqMarkets, type MarketIqMarketDefinition } from "@/data/market-iq/markets";
import type { MarketEntitlement } from "@/lib/auth/market-entitlements";

export function resolveActiveMarketIqMarket({
  requestedMarketId,
  preferredMarketId,
  entitlement,
}: {
  requestedMarketId?: string | null;
  preferredMarketId?: string | null;
  entitlement: MarketEntitlement;
}): MarketIqMarketDefinition | null {
  const entitledMarkets = listEntitledMarketIqMarkets(entitlement);
  if (!entitledMarkets.length) return null;

  for (const candidateId of [requestedMarketId, preferredMarketId, CLEVELAND_MARKET_ID]) {
    const candidate = getMarketIqMarket(candidateId);
    if (candidate && entitledMarkets.some((market) => market.id === candidate.id)) return candidate;
  }

  return entitledMarkets[0] ?? null;
}

