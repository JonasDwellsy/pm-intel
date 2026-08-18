import type { MarketEntitlement } from "@/lib/auth/market-entitlements";
import { filterToEntitled } from "@/lib/auth/market-entitlements";

export const CLEVELAND_MARKET_ID = "cleveland-elyria-mentor-oh";
export const COLUMBUS_MARKET_ID = "columbus-oh";
export const SAN_FRANCISCO_MARKET_ID = "san-francisco-oakland-berkeley-ca";
export const SAN_JOSE_MARKET_ID = "san-jose-sunnyvale-santa-clara-ca";

export type MarketIqMarketStatus = "live" | "preparing";

export type MarketIqMarketDefinition = {
  id: string;
  slug: string;
  cbsaCode: string;
  name: string;
  fullName: string;
  shortLabel: string;
  stateCodes: readonly string[];
  timeZone: string;
  map: {
    center: readonly [longitude: number, latitude: number];
    zoom: number;
  };
  status: MarketIqMarketStatus;
};

/**
 * The product-level market registry. IDs deliberately match the deployed
 * Dwellsy market identifiers used by entitlements and analytical imports.
 * A market can be commercially known before its full Market IQ adapter is
 * live, which lets selection fail honestly instead of showing Cleveland data.
 */
export const MARKET_IQ_MARKETS = [
  {
    id: CLEVELAND_MARKET_ID,
    slug: "cleveland",
    cbsaCode: "17460",
    name: "Cleveland–Elyria",
    fullName: "Cleveland–Elyria, OH MSA",
    shortLabel: "Cleveland",
    stateCodes: ["OH"],
    timeZone: "America/New_York",
    map: { center: [-81.6944, 41.4993], zoom: 8.4 },
    status: "live",
  },
  {
    id: COLUMBUS_MARKET_ID,
    slug: "columbus",
    cbsaCode: "18140",
    name: "Columbus",
    fullName: "Columbus, OH MSA",
    shortLabel: "Columbus",
    stateCodes: ["OH"],
    timeZone: "America/New_York",
    map: { center: [-82.9988, 39.9612], zoom: 8.4 },
    status: "live",
  },
  {
    id: SAN_FRANCISCO_MARKET_ID,
    slug: "san-francisco",
    cbsaCode: "41860",
    name: "San Francisco–Oakland",
    fullName: "San Francisco–Oakland–Berkeley, CA MSA",
    shortLabel: "San Francisco",
    stateCodes: ["CA"],
    timeZone: "America/Los_Angeles",
    map: { center: [-122.2711, 37.8044], zoom: 8.2 },
    status: "live",
  },
  {
    id: SAN_JOSE_MARKET_ID,
    slug: "san-jose",
    cbsaCode: "41940",
    name: "San Jose–Sunnyvale",
    fullName: "San Jose–Sunnyvale–Santa Clara, CA MSA",
    shortLabel: "San Jose",
    stateCodes: ["CA"],
    timeZone: "America/Los_Angeles",
    map: { center: [-121.8863, 37.3382], zoom: 8.7 },
    status: "live",
  },
] as const satisfies readonly MarketIqMarketDefinition[];

export type MarketIqMarketId = (typeof MARKET_IQ_MARKETS)[number]["id"];

const marketById = new Map<string, MarketIqMarketDefinition>(
  MARKET_IQ_MARKETS.map((market) => [market.id, market]),
);

export function getMarketIqMarket(marketId: string | null | undefined): MarketIqMarketDefinition | null {
  return marketId ? marketById.get(marketId) ?? null : null;
}

export function listEntitledMarketIqMarkets(entitlement: MarketEntitlement): MarketIqMarketDefinition[] {
  const entitledIds = new Set(filterToEntitled(entitlement, MARKET_IQ_MARKETS.map((market) => market.id)));
  return MARKET_IQ_MARKETS.filter((market) => entitledIds.has(market.id));
}
