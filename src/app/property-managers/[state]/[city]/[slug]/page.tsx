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
import { loadMarketFootprint } from "@/lib/cross-market";
import { loadMsaPool } from "@/lib/msa-pool";
import { buildPeerComparisons } from "@/lib/peer-comparison";
import { buildLendingSignals } from "@/lib/lending-signals";
import { buildCohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import { buildShareTrajectoryView } from "@/lib/share-trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { hasComparablePeers } from "@/lib/peer-comparison-view";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import { MarketView } from "@/components/market/MarketView";

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
    return <MarketView view={view} activeSegment={slug as QuadrantSegment} />;
  }

  // `unlocked` is still accepted (see RouteSearch comment) but no
  // longer drives any rendering decision; consume + discard so the
  // searchParams Promise still resolves cleanly.
  await searchParams;
  const loaded = await loadScorecard(slug);
  if (!loaded) notFound();
  const { scorecard, isClaimed } = loaded;
  // Layer 1 needs cross-market footprint; Layers 3 + 4 share an MSA pool
  // loaded once and consumed by both peer-comparison (Layer 3) and
  // lending-signals (Layer 4). Both renders run in-memory once the pool
  // arrives.
  const [marketFootprint, msaPool] = await Promise.all([
    loadMarketFootprint({ name: scorecard.pm.name, currentSlug: slug }),
    loadMsaPool(scorecard.market.id),
  ]);
  const peerComparisons = buildPeerComparisons(scorecard, msaPool);
  const lendingSignals = buildLendingSignals(
    scorecard,
    msaPool,
    marketFootprint.length
  );
  // Phase F — Layer 5E cohort overlay. In-memory from the same MSA pool.
  const cohortRentTrajectory = buildCohortRentTrajectory(scorecard, msaPool);
  // v0.6.3 Patch 6 — Layer 5F share-trajectory view. Reuses the same
  // msaPool the peer-comparison + lending-signals + cohort overlay
  // already loaded; the national benchmark is module-level cached so
  // only the cold first hit pays the cross-market query.
  const shareTrajectory = await buildShareTrajectoryView(
    scorecard,
    slug,
    msaPool
  );
  // v0.6.4 Patch 2 — Layer 5 concession context. Same msaPool feeds the
  // market-median cohort comparison, so no extra DB round-trip. Section
  // renders only when the focal operator has a non-null concessionRate
  // (PM was present in the classifier CSV input).
  const concessionContext = buildConcessionContext(scorecard, msaPool);
  // Compare-with-similar-PMs button target. hasComparablePeers returns
  // false on the rare edge case where this PM is the only ranked
  // operator in their market — sidebar hides the button entirely in
  // that case rather than routing to a comparison page that would show
  // an empty grid.
  const compareHref = hasComparablePeers(msaPool, slug)
    ? `/property-managers/${state}/${city}/${slug}/compare`
    : null;
  // v0.6.4 Patch 1 — cross-market context for the Layer 1 badge. Look
  // up the canonical entity only when this PM's canonicalOperatorId
  // doesn't match its own slug (single-market PMs have id === slug per
  // the v0.6.4 seed convention, so we can short-circuit the DB hit for
  // ~590 of 694 PMs in the current 10-market footprint). Returns null
  // for single-market operators → IdentityHero renders no badge.
  const crossMarketContext =
    scorecard.canonicalOperatorId &&
    scorecard.canonicalOperatorId !== scorecard.pm.slug
      ? await prisma.canonicalOperator.findUnique({
          where: { canonicalSlug: scorecard.canonicalOperatorId },
          select: { canonicalSlug: true, marketCount: true },
        })
      : null;
  return (
    <ScorecardBody
      scorecard={scorecard}
      isClaimed={isClaimed}
      marketFootprint={marketFootprint}
      peerComparisons={peerComparisons}
      lendingSignals={lendingSignals}
      cohortRentTrajectory={cohortRentTrajectory}
      crossMarketOperator={crossMarketContext}
      shareTrajectory={shareTrajectory}
      concessionContext={concessionContext}
      compareHref={compareHref}
    />
  );
}
