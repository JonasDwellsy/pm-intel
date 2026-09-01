// v0.30 — Consumer report PDF. PUBLIC route, gated per-request by
// resolveReportAccess (guest magic-link token, signed-in entitlement, or a
// just-paid Stripe session), NOT the B2B market entitlement. Assembles the
// SAME ScorecardView + OperatorProfilePDF as the B2B PDF route
// (src/app/api/scorecard/[slug]/pdf/route.tsx) — single-source, no drift —
// with the consumer gate swapped in and multi-market members left UNSCOPED
// (a single-report buyer bought the whole operator, cross-market view included,
// exactly like /report/r/[slug] and /sample).

import { renderToBuffer } from "@react-pdf/renderer";
import * as Sentry from "@sentry/nextjs";
import { PRODUCT_DOWNLOAD_SLUG } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { resolveReportAccess } from "@/lib/auth/report-entitlements.server";
import { verifyReportAccessToken } from "@/lib/report/access-token";
import { sessionGrantsReport } from "@/lib/billing/verify-session";
import { OperatorProfilePDF } from "@/components/scorecard/OperatorProfilePDF";
import { loadMsaPool } from "@/lib/msa-pool";
import {
  loadOperatorTrajectory,
  loadOperatorAggregateTrajectory,
} from "@/lib/operators/trajectory";
import { buildConcessionContext } from "@/lib/concession-context";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { parseScorecard } from "@/lib/scorecard/parse";
import { fetchCoverageMapImage } from "@/lib/scorecard/pdf-coverage-map";
import { MAP_W, MAP_H } from "@/lib/scorecard/coverage-map-geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("session_id");

  try {
    const pm = await prisma.pM.findUnique({ where: { slug } });
    if (!pm) return new Response("Report not found", { status: 404 });

    // Consumer gate: magic-link token (guest) or signed-in entitlement, then a
    // just-paid session as the immediate post-purchase fallback. 404 (not 403)
    // so an unpaid caller can't confirm the operator exists.
    const guestEmail = verifyReportAccessToken(token);
    const access = await resolveReportAccess(slug, pm.marketId, { guestEmail });
    let accessible = access.accessible;
    if (!accessible && sessionId) {
      accessible = await sessionGrantsReport(sessionId, slug, pm.marketId);
    }
    if (!accessible) return new Response("Report not found", { status: 404 });

    const scorecard = parseScorecard(pm);
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

    const view = buildScorecardView({
      scorecard,
      pool: msaPool,
      trajectory: operatorTrajectory,
      marketConcessionMedian: concessionContext.marketRate,
      ...(isMultiMarket
        ? { aggregateTrajectory, memberMarketNames, marketCount }
        : {}),
    });

    const mapboxToken =
      process.env.MAPBOX_SERVER_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const coverageMap = await fetchCoverageMapImage(
      scorecard.geographicCoverage,
      { width: MAP_W, height: MAP_H, token: mapboxToken, timeoutMs: 9000 }
    );

    const buffer = await renderToBuffer(
      <OperatorProfilePDF view={view} scorecard={scorecard} coverageMap={coverageMap} />
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${PRODUCT_DOWNLOAD_SLUG}-${slug}.pdf"`,
        // Per-buyer content behind an entitlement — do NOT cache at the shared
        // edge, or a token'd URL could serve a paid PDF from cache to another
        // caller. Private, no shared caching.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[report-pdf] render error", err, { slug });
    try {
      Sentry.captureException(err, {
        tags: { component: "report-pdf" },
        extra: { slug },
      });
    } catch {
      /* Sentry unavailable — already logged above */
    }
    return new Response("Failed to render report PDF", { status: 500 });
  }
}
