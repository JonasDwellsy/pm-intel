export type MarketIqProductArea = "home" | "market-intelligence" | "client-reporting" | null;

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
  if (pathname === "/market-iq") return "home";
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
