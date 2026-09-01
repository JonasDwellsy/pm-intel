// Typed loader for src/data/markets-with-coverage.json + a tiny
// helper for the mailto link the available-upon-request markers
// trigger. Keeping this thin so the MarketsCoverageMap component
// stays free of data-shape and URL-encoding details.

import data from "@/data/markets-with-coverage.json";
import summary from "@/data/markets-summary.json";
import { stateCodeToSlug, citySlug } from "@/lib/slugify";

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

interface SeedMarket {
  id: string;
  city: string;
  state: string;
}

const ALL_MARKETS = ((data as unknown) as MarketsFile).markets;

// Live/available status is DERIVED from the seed, never read from the
// stored `status` field — that field is just an advisory snapshot. A
// market is "live" iff its coverage slug matches a seeded market id in
// markets-summary.json (which merge.py regenerates from the scorecard
// data). This means adding or removing a market in markets.json self-
// corrects the map: a newly-seeded metro flips to a clickable live dot
// the moment its coverage entry's slug matches the seed id, and a
// removed one drops back to "available upon request" — no hand-editing
// of statuses, which is exactly the drift that stranded live markets as
// grey "coming soon" dots before.
const SEED_BY_ID = new Map<string, SeedMarket>(
  ((summary as unknown) as { markets: SeedMarket[] }).markets.map((m) => [
    m.id,
    m,
  ])
);

export function getCoverageMarkets(): MarketCoverageEntry[] {
  return ALL_MARKETS.map((m) => {
    const seed = SEED_BY_ID.get(m.slug);
    if (seed) {
      return {
        ...m,
        status: "live" as const,
        // Derive the href from the seed too, so a live dot can never
        // point at a stale or missing URL.
        marketPageHref: `/property-managers/${stateCodeToSlug(
          seed.state
        )}/${citySlug(seed.city)}`,
      };
    }
    // Not in the seed → available upon request. Rebuild without any
    // stale href so the component renders the mailto target, not a dead
    // scorecard link.
    return {
      slug: m.slug,
      name: m.name,
      shortName: m.shortName,
      centroid: m.centroid,
      status: "available" as const,
    };
  });
}

/** Pre-built `mailto:` link for the "available upon request"
 *  click target. Pass the market when the click came from a
 *  specific dot (subject + body reference that market by name);
 *  omit it for the page-level footer CTA. */
export function buildCoverageRequestMailto(market?: MarketCoverageEntry): string {
  const to = "partnerships@dwellsy.com";
  const subject = market
    ? `Dwellsy IQ Markets coverage request: ${market.name}`
    : "Dwellsy IQ Markets coverage request";
  const body = market
    ? `I'm interested in seeing coverage for ${market.name}. Please reach out to discuss.`
    : "I'd like to discuss Dwellsy IQ Markets coverage in a market that isn't live yet. Please reach out.";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
