// v0.30 — Consumer single-report page. PUBLIC route (not in
// PROTECTED_ROUTE_PATTERNS): anyone can reach it, but the full scorecard is
// gated per-request by resolveReportAccess (admin → B2B market entitlement →
// per-PM purchase → market pass / subscription). Non-buyers get the teaser.
//
// Renders the SAME <ScorecardBody> as /sample and the B2B scorecard page, from
// the same buildScorecardView pipeline — single-source, no drift. force-dynamic
// because the gate reads per-request auth + query token.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseScorecard } from "@/lib/scorecard/parse";
import { loadMsaPool } from "@/lib/msa-pool";
import {
  loadOperatorTrajectory,
  loadOperatorAggregateTrajectory,
} from "@/lib/operators/trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import { resolveReportAccess } from "@/lib/auth/report-entitlements.server";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { tierFromScorecard } from "@/lib/report/confidence-tier";
import { ReportTeaser } from "@/components/report/ReportTeaser";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface RouteParams {
  slug: string;
}
interface RouteSearch {
  token?: string;
  session_id?: string;
  partner?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pm = await prisma.pM.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (!pm) return { title: "Report not found" };
  return {
    title: `${pm.name} — property manager report`,
    description: `An independent Operator IQ performance report on ${pm.name}: how they rank against local peers on lease-up speed, tenant retention, rent performance, and listing quality.`,
    robots: { index: false }, // paid content — don't index per-operator report pages
  };
}

/** Post-checkout return path: confirm the Stripe session was paid and covers
 *  THIS report, so the buyer sees it immediately even before the webhook has
 *  written the durable entitlement. Defensive — any mismatch falls through to
 *  the normal (DB-backed) gate. */
async function sessionGrantsReport(
  sessionId: string,
  slug: string,
  marketId: string
): Promise<boolean> {
  if (!stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return false;
    const md = session.metadata ?? {};
    if (md.kind === "single_report") return md.pmSlug === slug;
    if (md.kind === "market_pass" || md.kind === "subscription") {
      return md.marketId === marketId;
    }
    return false;
  } catch {
    return false;
  }
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { slug } = await params;
  const { token, session_id: sessionId, partner } = await searchParams;

  const pm = await prisma.pM.findUnique({ where: { slug } });
  if (!pm) notFound();

  const scorecard = parseScorecard(pm);
  const marketId = scorecard.market.id;

  const guestEmail = verifyReportAccessToken(token);
  const access = await resolveReportAccess(slug, marketId, { guestEmail });
  let accessible = access.accessible;
  if (!accessible && sessionId) {
    accessible = await sessionGrantsReport(sessionId, slug, marketId);
  }

  if (!accessible) {
    return (
      <ReportTeaser
        scorecard={scorecard}
        tierInfo={tierFromScorecard(scorecard)}
        partner={partner ?? null}
      />
    );
  }

  // Entitled — render the full scorecard via the shared pipeline (mirrors
  // /sample and the B2B page exactly).
  const isMultiMarket =
    !!scorecard.canonicalOperatorId &&
    scorecard.canonicalOperatorId !== scorecard.pm.slug;

  const [msaPool, operatorTrajectory, members] = await Promise.all([
    loadMsaPool(scorecard.market.id),
    loadOperatorTrajectory(slug),
    isMultiMarket
      ? prisma.pM.findMany({
          where: { canonicalOperatorId: scorecard.canonicalOperatorId },
          select: {
            slug: true,
            marketId: true,
            market: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const memberPmSlugs = members.map((m) => m.slug);
  const memberMarketNames = Array.from(
    new Set(members.map((m) => m.market.fullName))
  );
  const marketCount = new Set(members.map((m) => m.marketId)).size;
  const aggregateTrajectory = isMultiMarket
    ? await loadOperatorAggregateTrajectory(memberPmSlugs)
    : undefined;

  const concessionContext = buildConcessionContext(scorecard, msaPool);

  const scorecardView = buildScorecardView({
    scorecard,
    pool: msaPool,
    trajectory: operatorTrajectory,
    marketConcessionMedian: concessionContext.marketRate,
    ...(isMultiMarket
      ? { aggregateTrajectory, memberMarketNames, marketCount }
      : {}),
  });

  return (
    <main className="bg-[#FBFAF6]">
      <ScorecardBody
        view={scorecardView}
        scorecard={scorecard}
        isClaimed={pm.claimed}
        geographicCoverage={scorecard.geographicCoverage}
        // Hide the header Copy-link + Download-PDF buttons for now: the PDF
        // route is still B2B-gated, so a guest buyer would dead-end. The
        // consumer PDF route + emailed delivery land in the next slice.
        publicSample
      />
    </main>
  );
}
