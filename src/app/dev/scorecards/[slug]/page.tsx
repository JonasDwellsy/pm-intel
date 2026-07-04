// DEV-ONLY, UNCOMMITTED preview harness — renders the REDESIGNED scorecard for
// a REAL operator (by slug) through the exact same data path as the production
// page, but WITHOUT the Clerk auth / market-entitlement gate. 404s in prod.
// Lets us eyeball the redesign on real data before merging PR #140.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { loadMsaPool } from "@/lib/msa-pool";
import { loadOperatorTrajectory, loadOperatorAggregateTrajectory } from "@/lib/operators/trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";

export const dynamic = "force-dynamic";

export default async function DevRealScorecard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;

  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) notFound();
  const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;
  const isClaimed = pm.claimed;

  // Mirror the production page's multi-market loading so the dev preview shows
  // the cross-market footprint on real operators. Dev-only: NO entitlement
  // filter here (this route is auth-bypassed and shows all markets).
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

  const view = buildScorecardView({
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
      <ScorecardBody
        view={view}
        scorecard={scorecard}
        isClaimed={isClaimed}
        geographicCoverage={scorecard.geographicCoverage}
      />
    </>
  );
}
