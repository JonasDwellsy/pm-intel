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
import { loadMsaPool } from "@/lib/msa-pool";
import { loadOperatorTrajectory } from "@/lib/operators/trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import { MarketView } from "@/components/market/MarketView";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import {
  resolveViewerEntitlement,
  isMarketEntitled,
} from "@/lib/auth/market-entitlements.server";
import { MarketLockedUpsell } from "@/components/entitlements/MarketLockedUpsell";

// Premium per-operator + segment pages gate on the viewer's market
// entitlement, which requires per-request auth — so they render
// dynamically rather than as build-time static HTML.
export const dynamic = "force-dynamic";

type RouteParams = { state: string; city: string; slug: string };
type RouteSearch = {
  // PR #47 retired the scorecard paywall. The `unlocked` param is
  // still accepted (so stale inbound links don't 404) but it has
  // no behavioral effect — every visitor sees the full scorecard.
  unlocked?: string;
  // Preserved across chip clicks when a submarket filter is active. Only
  // relevant on the segment branch — the scorecard branch ignores it.
  submarket?: string | string[];
};

async function loadScorecard(slug: string) {
  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) return null;
  return {
    scorecard: JSON.parse(pm.scorecardData) as ScorecardData,
    isClaimed: pm.claimed,
  };
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

  const loaded = await loadScorecard(slug);
  if (!loaded) return { title: "Property manager not found" };
  const { scorecard } = loaded;
  const title = `${scorecard.pm.name} — Scorecard (${scorecard.market.fullName})`;
  // No precise rank in metadata — facts-not-judgments (never surface an
  // ordinal rank/composite on scorecards). Keep it descriptive + keyword-rich.
  const description = `Independent scorecard for ${scorecard.pm.name}: ${scorecard.pm.quadrant} operator in ${scorecard.market.name}. Days-on-market, tenant retention, rent performance, and marketing signals with peer-cohort context.`;
  // PR #75 — Add canonical URL so search engines + OG unfurls agree
  // on the stable scorecard URL (no querystring variations). The
  // opengraph-image.tsx file in this directory is auto-attached by
  // Next.js's file-convention OG routing — listing it in the
  // openGraph.images array would double-emit it. type: "article"
  // matches the existing convention; alternates.canonical is the
  // new addition.
  return {
    title,
    description,
    alternates: { canonical: `/property-managers/${state}/${city}/${slug}` },
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
    const { submarket } = await searchParams;
    const submarketParam = Array.isArray(submarket) ? submarket[0] : submarket;
    const view = await loadMarketView({
      stateUrlSegment: state,
      cityUrlSegment: city,
      segment: slug as QuadrantSegment,
      submarketSlug:
        submarketParam && submarketParam.length > 0 ? submarketParam : null,
    });
    if (!view) notFound();
    const entitlement = await resolveViewerEntitlement();
    if (!isMarketEntitled(entitlement, view.market.id)) {
      return <MarketLockedUpsell marketName={view.market.fullName} />;
    }
    return <MarketView view={view} activeSegment={slug as QuadrantSegment} />;
  }

  // `unlocked` is still accepted (see RouteSearch comment) but no
  // longer drives any rendering decision; consume + discard so the
  // searchParams Promise still resolves cleanly.
  await searchParams;
  const loaded = await loadScorecard(slug);
  if (!loaded) notFound();
  const { scorecard, isClaimed } = loaded;
  // Entitlement gate — the operator's market must be in the viewer's
  // plan. Hybrid model: non-entitled → upsell, not 404.
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, scorecard.market.id)) {
    return <MarketLockedUpsell marketName={scorecard.market.fullName} />;
  }
  // Load MSA pool (feeds view model peer selection + concession cohort)
  // and operator trajectory (feeds momentum sparklines).
  const [msaPool, operatorTrajectory] = await Promise.all([
    loadMsaPool(scorecard.market.id),
    loadOperatorTrajectory(slug),
  ]);
  // Market-median concession rate for watch-items detector.
  const concessionContext = buildConcessionContext(scorecard, msaPool);

  // Build the redesigned view model (pure, in-memory).
  const view = buildScorecardView({
    scorecard,
    pool: msaPool,
    trajectory: operatorTrajectory,
    marketConcessionMedian: concessionContext.marketMedianRate,
  });

  return (
    <>
      {/* v0.17 — scorecard_viewed. Slug + MSA + classification only.
          Per the privacy guardrail in PRIVACY.md we never attach
          underlying numerics (rent, DOM, star tiers, portfolio
          estimates) — those are dimensions that belong on the
          scorecard surface, not in funnel events. */}
      <TrackEvent
        event="scorecard_viewed"
        properties={{
          operator_slug: scorecard.pm.slug,
          operator_msa: scorecard.market.id,
          operator_classification:
            scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant,
        }}
      />
      <ScorecardBody
        view={view}
        scorecard={scorecard}
        isClaimed={isClaimed}
        geographicCoverage={scorecard.geographicCoverage}
      />
    </>
  );
}
