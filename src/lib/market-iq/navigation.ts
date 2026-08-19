export type MarketIqProductArea = "home" | "market-intelligence" | "client-reporting" | null;

export const MARKET_IQ_CANONICAL_ROUTES = {
  home: "/market-iq",
  marketIntelligence: "/market-iq/market",
  clientReporting: "/market-iq/client-reporting",
  account: "/market-iq/account",
} as const;

export const MARKET_IQ_MARKET_INTELLIGENCE_ROUTES = {
  overview: MARKET_IQ_CANONICAL_ROUTES.marketIntelligence,
  briefing: "/market-iq/briefing",
} as const;

export const MARKET_IQ_CLIENT_REPORTING_ROUTES = {
  overview: MARKET_IQ_CANONICAL_ROUTES.clientReporting,
  reports: "/market-iq/editions",
  recipients: "/market-iq/distribution",
  delivery: "/market-iq/sharing",
  performance: "/market-iq/performance",
} as const;

const CLIENT_REPORTING_PREFIXES = [
  "/market-iq/client-reporting",
  "/market-iq/editions",
  "/market-iq/review",
  "/market-iq/report",
  "/market-iq/published",
  "/market-iq/distribution",
  "/market-iq/sharing",
  "/market-iq/delivery",
  "/market-iq/performance",
] as const;

export function marketIqProductArea(pathname: string): MarketIqProductArea {
  if (pathname === MARKET_IQ_CANONICAL_ROUTES.home) return "home";
  if (pathname.startsWith("/market-iq/market") || pathname.startsWith("/market-iq/briefing")) {
    return "market-intelligence";
  }
  if (CLIENT_REPORTING_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return "client-reporting";
  }
  return null;
}

export function marketIqClientReportingTab(pathname: string) {
  if (pathname.startsWith("/market-iq/client-reporting")) return "overview";
  if (pathname.startsWith("/market-iq/distribution") && pathname !== "/market-iq/distribution") return "delivery";
  if (pathname === "/market-iq/distribution") return "recipients";
  if (pathname.startsWith("/market-iq/sharing") || pathname.startsWith("/market-iq/delivery")) return "delivery";
  if (pathname.startsWith("/market-iq/performance")) return "performance";
  if (
    pathname.startsWith("/market-iq/editions") ||
    pathname.startsWith("/market-iq/review") ||
    pathname.startsWith("/market-iq/report") ||
    pathname.startsWith("/market-iq/published")
  ) return "reports";
  return null;
}
