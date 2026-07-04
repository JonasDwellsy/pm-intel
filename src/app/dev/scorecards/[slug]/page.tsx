// DEV-ONLY, UNCOMMITTED preview harness — renders the REDESIGNED scorecard for
// a REAL operator (by slug) through the exact same data path as the production
// page, but WITHOUT the Clerk auth / market-entitlement gate. 404s in prod.
// Lets us eyeball the redesign on real data before merging PR #140.
//
// Mirrors production's per-operator A/B branch (view === "new" vs classic
// fallthrough) in src/app/property-managers/[state]/[city]/[slug]/page.tsx,
// with two dev-only adaptations:
//   1. View selection checks a `?view=` query param FIRST (for easy headless
//      rendering), then the `scorecard_view` cookie, else defaults to classic.
//   2. This route shows ALL markets (auth-bypassed) — the classic path's
//      loadMarketFootprint(...) and crossMarketContext pass entitlement:
//      ALL_MARKETS instead of a resolved per-viewer entitlement. The new
//      path's cross-market member enumeration already loads all members
//      with no entitlement filter.
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { loadMarketFootprint } from "@/lib/cross-market";
import { loadMsaPool } from "@/lib/msa-pool";
import { loadOperatorTrajectory, loadOperatorAggregateTrajectory } from "@/lib/operators/trajectory";
import { buildPeerComparisons } from "@/lib/peer-comparison";
import { buildLendingSignals } from "@/lib/lending-signals";
import { buildCohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import { buildShareTrajectoryView } from "@/lib/share-trajectory";
import { hasComparablePeers } from "@/lib/peer-comparison-view";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import { ClassicScorecardBody } from "@/components/scorecard/ClassicScorecardBody";
import { ScorecardViewToggle } from "@/components/scorecard/ScorecardViewToggle";
import { ALL_MARKETS } from "@/lib/auth/market-entitlements";

export const dynamic = "force-dynamic";

function DevBanner({
  scorecard,
  trajPts,
}: {
  scorecard: ScorecardData;
  trajPts: number;
}) {
  return (
    <div
      style={{
        background: "#fff7d6",
        borderBottom: "1px solid #e6d98a",
        padding: "8px 16px",
        fontSize: "13px",
        color: "#6b5e17",
      }}
    >
      Dev preview — <strong>REAL data</strong> for {scorecard.pm.name} ·{" "}
      {scorecard.market.fullName} · {trajPts} trajectory snapshot
      {trajPts === 1 ? "" : "s"}. Auth bypassed; dev-only route.{" "}
      <a href="/dev/scorecards" style={{ textDecoration: "underline" }}>
        ← all operators
      </a>
    </div>
  );
}

export default async function DevRealScorecard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;

  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) notFound();
  const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;
  const isClaimed = pm.claimed;

  // View selection — query param first (headless rendering), then cookie,
  // else default to classic.
  const sp = await searchParams;
  const cookieView = (await cookies()).get("scorecard_view")?.value;
  const view =
    sp.view === "classic" || sp.view === "new"
      ? sp.view
      : cookieView === "new"
        ? "new"
        : "classic";

  if (view === "new") {
    // Mirror the production page's multi-market loading so the dev preview
    // shows the cross-market footprint on real operators. Dev-only: NO
    // entitlement filter here (this route is auth-bypassed and shows all
    // markets) — keep loading all members.
    const isMultiMarket =
      !!scorecard.canonicalOperatorId &&
      scorecard.canonicalOperatorId !== scorecard.pm.slug;

    const [msaPool, operatorTrajectory, members] = await Promise.all([
      loadMsaPool(scorecard.market.id),
      loadOperatorTrajectory(slug),
      isMultiMarket
        ? prisma.pM.findMany({
            where: { canonicalOperatorId: scorecard.canonicalOperatorId },
            select: { slug: true, marketId: true, market: { select: { fullName: true } } },
          })
        : Promise.resolve([]),
    ]);
    const memberPmSlugs = members.map((m) => m.slug);
    const memberMarketNames = Array.from(new Set(members.map((m) => m.market.fullName)));
    const marketCount = new Set(members.map((m) => m.marketId)).size;
    const aggregateTrajectory = isMultiMarket
      ? await loadOperatorAggregateTrajectory(memberPmSlugs)
      : undefined;

    const concessionContext = buildConcessionContext(scorecard, msaPool);

    const scorecardView = buildScorecardView({
      scorecard,
      pool: msaPool,
      trajectory: operatorTrajectory,
      marketConcessionMedian: concessionContext.marketMedianRate,
      ...(isMultiMarket
        ? { aggregateTrajectory, memberMarketNames, marketCount }
        : {}),
    });

    const trajPts = operatorTrajectory?.points?.length ?? 0;

    return (
      <>
        <DevBanner scorecard={scorecard} trajPts={trajPts} />
        <div className="mx-auto max-w-[1440px] px-6 pt-4 sm:px-10">
          <ScorecardViewToggle currentView={view} />
        </div>
        <ScorecardBody
          view={scorecardView}
          scorecard={scorecard}
          isClaimed={isClaimed}
          geographicCoverage={scorecard.geographicCoverage}
        />
      </>
    );
  }

  // Classic (A) — mirror production's classic loading exactly, but with
  // ALL_MARKETS entitlement since this dev route is auth-bypassed and
  // shows every market.
  const [marketFootprint, msaPool, operatorTrajectory] = await Promise.all([
    loadMarketFootprint({
      name: scorecard.pm.name,
      currentSlug: slug,
      entitlement: ALL_MARKETS,
    }),
    loadMsaPool(scorecard.market.id),
    loadOperatorTrajectory(slug),
  ]);
  const peerComparisons = buildPeerComparisons(scorecard, msaPool);
  const lendingSignals = buildLendingSignals(
    scorecard,
    msaPool,
    marketFootprint.length
  );
  const cohortRentTrajectory = buildCohortRentTrajectory(scorecard, msaPool);
  const shareTrajectory = await buildShareTrajectoryView(
    scorecard,
    slug,
    msaPool
  );
  const concessionContext = buildConcessionContext(scorecard, msaPool);
  const compareHref = hasComparablePeers(msaPool, slug)
    ? `/dev/scorecards/${slug}/compare`
    : null;
  const crossMarketContext =
    scorecard.canonicalOperatorId &&
    scorecard.canonicalOperatorId !== scorecard.pm.slug
      ? await prisma.canonicalOperator.findUnique({
          where: { canonicalSlug: scorecard.canonicalOperatorId },
          select: { canonicalSlug: true, marketCount: true },
        })
      : null;

  const trajPts = operatorTrajectory?.points?.length ?? 0;

  return (
    <>
      <DevBanner scorecard={scorecard} trajPts={trajPts} />
      <div className="mx-auto max-w-[1440px] px-6 pt-4 sm:px-10">
        <ScorecardViewToggle currentView={view} />
      </div>
      <ClassicScorecardBody
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
        operatorTrajectory={operatorTrajectory}
      />
    </>
  );
}
