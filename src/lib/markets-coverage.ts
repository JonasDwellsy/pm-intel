// Typed loader for src/data/markets-with-coverage.json + a tiny
// helper for the mailto link the available-upon-request markers
// trigger. Keeping this thin so the MarketsCoverageMap component
// stays free of data-shape and URL-encoding details.

import data from "@/data/markets-with-coverage.json";

export interface MarketCoverageEntry {
  slug: string;
  name: string;
  shortName: string;
  centroid: { lat: number; lng: number };
  status: "live" | "available";
  /** Present for status="live" only — the URL the dot links to. */
  marketPageHref?: string;
}

interface MarketsFile {
  markets: MarketCoverageEntry[];
}

const ALL_MARKETS = ((data as unknown) as MarketsFile).markets;

export function getCoverageMarkets(): MarketCoverageEntry[] {
  return ALL_MARKETS;
}

/** Pre-built `mailto:` link for the "available upon request"
 *  click target. Pass the market when the click came from a
 *  specific dot (subject + body reference that market by name);
 *  omit it for the page-level footer CTA. */
export function buildCoverageRequestMailto(market?: MarketCoverageEntry): string {
  const to = "partnerships@dwellsy.com";
  const subject = market
    ? `Dwellsy IQ coverage request: ${market.name}`
    : "Dwellsy IQ coverage request";
  const body = market
    ? `I'm interested in seeing coverage for ${market.name}. Please reach out to discuss.`
    : "I'd like to discuss Dwellsy IQ coverage in a market that isn't live yet. Please reach out.";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
