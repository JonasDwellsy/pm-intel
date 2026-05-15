import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketView } from "@/components/market/MarketView";
import { listMarketRouteParams, loadMarketView } from "@/lib/market-data";

type RouteParams = { state: string; city: string };

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
    alternates: { canonical: `/property-managers/${state}/${city}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function MarketLandingPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, city } = await params;
  const view = await loadMarketView({
    stateUrlSegment: state,
    cityUrlSegment: city,
    segment: null,
  });
  if (!view) notFound();
  return <MarketView view={view} activeSegment={null} />;
}
