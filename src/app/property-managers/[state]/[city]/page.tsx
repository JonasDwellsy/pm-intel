import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketView } from "@/components/market/MarketView";
import { listMarketRouteParams, loadMarketView } from "@/lib/market-data";
import { findTrackedInMarket } from "@/lib/pm-search";

type RouteParams = { state: string; city: string };
// Optional query params surfaced to the page. Next typed `searchParams` as
// `Record<string, string | string[] | undefined>`; we narrow inline below.
// `highlight` is set when a Tier 2 PM search result routes here — drives
// the TrackedOperatorBanner above the Market Snapshot.
type RouteSearch = {
  submarket?: string | string[];
  highlight?: string | string[];
};

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listMarketRouteParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const view = await loadMarketView({
    stateUrlSegment: state,
    cityUrlSegment: city,
    segment: null,
  });
  if (!view) return { title: "Market not found" };
  const title = `Top property managers in ${view.market.city}, ${view.market.state}`;
  const description = `Ranked scorecards for ${view.market.operatorCountEligible} eligible operators in ${view.market.fullName}. Median DOM ${view.market.medianDomT12.toFixed(1)} days.`;
  return {
    title,
    description,
    // Always canonicalize to the bare market URL — submarket filter state is
    // a discovery affordance, not a separate page worth indexing.
    alternates: { canonical: `/property-managers/${state}/${city}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function MarketLandingPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { state, city } = await params;
  const { submarket, highlight } = await searchParams;
  // Coerce array form (?submarket=a&submarket=b) → first entry; coerce empty
  // string to null so the filter only activates on a real value.
  const submarketParam = Array.isArray(submarket) ? submarket[0] : submarket;
  const highlightParam = Array.isArray(highlight) ? highlight[0] : highlight;
  const view = await loadMarketView({
    stateUrlSegment: state,
    cityUrlSegment: city,
    segment: null,
    submarketSlug: submarketParam && submarketParam.length > 0 ? submarketParam : null,
  });
  if (!view) notFound();
  // Tier 2 search highlight — look up the operator in this market's
  // universe. Silent fail (null) when the name doesn't resolve so a
  // hand-typed or stale URL doesn't render an empty banner.
  const trackedHighlight =
    highlightParam && highlightParam.length > 0
      ? findTrackedInMarket(view.market.id, highlightParam)
      : null;
  return (
    <MarketView
      view={view}
      activeSegment={null}
      trackedHighlight={trackedHighlight}
    />
  );
}
