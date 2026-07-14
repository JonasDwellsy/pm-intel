// Operator profile PDF route — redesigned scorecard.
//
// GET /api/scorecard/[slug]/pdf
//   → 200 application/pdf  (branded operator profile that mirrors the
//     redesigned web scorecard: Header · 30-second readout · 01 Scale &
//     Fit · 02 Operating Performance · 03 Momentum · 04 Watch Items ·
//     05 Methodology)
//   → 404 if the PM slug doesn't exist, or the market isn't in the
//     caller's entitlement (404 not 403 so we don't confirm existence
//     of an operator in an unpurchased market)
//   → 500 + Sentry on render failure
//
// Single-source principle: this route assembles the SAME ScorecardView the
// live scorecard page builds (src/app/property-managers/[state]/[city]/[slug]/
// page.tsx) via buildScorecardView(), then hands it to OperatorProfilePDF, so
// web + PDF can never drift on data. The inputs assembled here mirror page.tsx
// exactly: the msaPool, the operator trajectory (via its loader), the
// market-wide concession rate (buildConcessionContext(...).marketRate fed as
// marketConcessionMedian), and the multi-market extras (aggregateTrajectory,
// memberMarketNames, marketCount) when the operator is multi-market.

import { renderToBuffer } from "@react-pdf/renderer";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import {
  resolveViewerEntitlement,
  isMarketEntitled,
} from "@/lib/auth/market-entitlements.server";
import { OperatorProfilePDF } from "@/components/scorecard/OperatorProfilePDF";
import { loadMsaPool } from "@/lib/msa-pool";
import {
  loadOperatorTrajectory,
  loadOperatorAggregateTrajectory,
} from "@/lib/operators/trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { parseScorecard } from "@/lib/scorecard/parse";

// nodejs runtime — Prisma + @react-pdf/renderer both need Node. PDF generation
// is CPU + memory heavier than the OG image route, so it doesn't run on edge.
export const runtime = "nodejs";
// PDF generation can take ~1-3s on a cold lambda. Keep the route dynamic so we
// don't try to statically pre-generate at build time.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const pm = await prisma.pM.findUnique({ where: { slug } });
    if (!pm) {
      return new Response("Operator not found", { status: 404 });
    }

    // Entitlement gate — the PDF is the full premium scorecard. 404 (not
    // 403) so we don't confirm the operator exists in a market the caller's
    // org hasn't purchased.
    const entitlement = await resolveViewerEntitlement();
    if (!isMarketEntitled(entitlement, pm.marketId)) {
      return new Response("Operator not found", { status: 404 });
    }

    const scorecard = parseScorecard(pm);

    // Multi-market detection — mirrors page.tsx: a canonicalOperatorId that
    // differs from this member's own slug (v0.6.4 seed convention).
    const isMultiMarket =
      !!scorecard.canonicalOperatorId &&
      scorecard.canonicalOperatorId !== scorecard.pm.slug;

    // Load MSA pool (feeds view-model peer selection + concession cohort),
    // operator trajectory (feeds momentum sparklines), and — for multi-market
    // operators — the member PM enumeration needed for the cross-market
    // aggregate trajectory. Same three parallel loads page.tsx runs.
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

    // Scope the cross-market member enumeration to the viewer's entitled
    // markets BEFORE deriving anything from it — mirrors page.tsx (and
    // loadOperatorScorecard). Without this, a viewer entitled to only some of
    // the operator's markets would see non-entitled markets leak into the
    // aggregate trajectory + member-market list.
    const entitledMembers = members.filter((m) =>
      isMarketEntitled(entitlement, m.marketId)
    );
    const memberPmSlugs = entitledMembers.map((m) => m.slug);
    const memberMarketNames = Array.from(
      new Set(entitledMembers.map((m) => m.market.fullName))
    );
    const marketCount = new Set(entitledMembers.map((m) => m.marketId)).size;
    const aggregateTrajectory = isMultiMarket
      ? await loadOperatorAggregateTrajectory(memberPmSlugs)
      : undefined;

    // Market-wide concession rate for the watch-items detector (fed as
    // marketConcessionMedian — see BuildViewInput doc comment on the retained
    // field name).
    const concessionContext = buildConcessionContext(scorecard, msaPool);

    // Build the redesigned view model (pure, in-memory) — the single source
    // both web + PDF read from.
    const view = buildScorecardView({
      scorecard,
      pool: msaPool,
      trajectory: operatorTrajectory,
      marketConcessionMedian: concessionContext.marketRate,
      ...(isMultiMarket
        ? { aggregateTrajectory, memberMarketNames, marketCount }
        : {}),
    });

    const buffer = await renderToBuffer(
      <OperatorProfilePDF view={view} scorecard={scorecard} />
    );

    // Trigger a download with a stable filename. The dwellsy-iq- prefix makes
    // the file recognizable in deal-room folders alongside other artifacts.
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dwellsy-iq-${slug}.pdf"`,
        // Cache for an hour at the edge so re-downloads in the same session
        // don't re-render. Content is deterministic for a given seed version +
        // slug; an hour is conservative.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    // Surface to Vercel logs first (Sentry can fail to load; we still want
    // diagnostic ground truth).
    console.error("[scorecard-pdf] render error", err, { slug });
    try {
      Sentry.captureException(err, {
        tags: { component: "scorecard-pdf" },
        extra: { slug },
      });
    } catch {
      // Sentry capture itself failed — already logged the real error above.
    }
    return new Response("Failed to render scorecard PDF", { status: 500 });
  }
}
