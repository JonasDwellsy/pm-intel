import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import {
  citySlug,
  isQuadrantSegment,
  segmentLabel,
  stateCodeToSlug,
  type QuadrantSegment,
} from "@/lib/slugify";
import {
  listSegmentRouteParams,
  loadMarketView,
} from "@/lib/market-data";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import { MarketView } from "@/components/market/MarketView";

type RouteParams = { state: string; city: string; slug: string };
type RouteSearch = { unlocked?: string };

async function loadScorecard(slug: string) {
  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) return null;
  return JSON.parse(pm.scorecardData) as ScorecardData;
}

export async function generateStaticParams(): Promise<RouteParams[]> {
  const [pms, segmentParams] = await Promise.all([
    prisma.pM.findMany({
      select: {
        slug: true,
        market: { select: { state: true, city: true } },
      },
    }),
    listSegmentRouteParams(),
  ]);

  const pmParams: RouteParams[] = pms.map((pm) => ({
    state: stateCodeToSlug(pm.market.state),
    city: citySlug(pm.market.city),
    slug: pm.slug,
  }));

  const segParams: RouteParams[] = segmentParams.map((p) => ({
    state: p.state,
    city: p.city,
    slug: p.segment,
  }));

  return [...pmParams, ...segParams];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, city, slug } = await params;

  if (isQuadrantSegment(slug)) {
    const view = await loadMarketView({
      stateUrlSegment: state,
      cityUrlSegment: city,
      segment: slug,
    });
    if (!view) return { title: "Market not found" };
    const title = `${segmentLabel(slug)} property managers in ${view.market.city}`;
    const description = `${view.filteredPms.length} ${segmentLabel(slug).toLowerCase()} operator${view.filteredPms.length === 1 ? "" : "s"} ranked in ${view.market.fullName}.`;
    return {
      title,
      description,
      alternates: { canonical: `/property-managers/${state}/${city}/${slug}` },
      openGraph: { title, description, type: "website" },
    };
  }

  const scorecard = await loadScorecard(slug);
  if (!scorecard) return { title: "Property manager not found" };
  const title = `${scorecard.pm.name} — Scorecard (${scorecard.market.fullName})`;
  const description = `Independent scorecard for ${scorecard.pm.name}: ${scorecard.pm.quadrant} operator ranked #${scorecard.rank.overall} of ${scorecard.rank.overallTotal} in ${scorecard.market.name}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
  };
}

export default async function MarketChildPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { state, city, slug } = await params;

  if (isQuadrantSegment(slug)) {
    const view = await loadMarketView({
      stateUrlSegment: state,
      cityUrlSegment: city,
      segment: slug as QuadrantSegment,
    });
    if (!view) notFound();
    return <MarketView view={view} activeSegment={slug as QuadrantSegment} />;
  }

  const { unlocked } = await searchParams;
  const scorecard = await loadScorecard(slug);
  if (!scorecard) notFound();
  return <ScorecardBody scorecard={scorecard} isUnlocked={unlocked === "true"} />;
}
