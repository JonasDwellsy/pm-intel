// PR #84 — Operator profile PDF route.
//
// GET /api/scorecard/[slug]/pdf
//   → 200 application/pdf  (4-5 page branded operator profile)
//   → 404 if the PM slug doesn't exist
//   → 500 + branded error PDF on render failure (Sentry-instrumented)
//
// Replaces the prior PrintScorecardButton's window.print() pipeline.
// The button now navigates here directly via <a download>, so the
// browser triggers a real file save instead of the system print
// dialog. Files are named `dwellsy-iq-<slug>.pdf`.

import { renderToBuffer } from "@react-pdf/renderer";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { OperatorProfilePDF } from "@/components/scorecard/OperatorProfilePDF";
import { loadMsaPool } from "@/lib/msa-pool";
import { buildCohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import type { ScorecardData } from "@/lib/types";

// nodejs runtime — Prisma + @react-pdf/renderer both need Node. The
// PDF generation is CPU + memory heavier than the OG image route
// (multi-page composition + fonts), so we don't run on edge.
export const runtime = "nodejs";
// PDF generation can take ~1-3s for a cold lambda. Keep the route
// dynamic so we don't try to statically pre-generate at build time.
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

    const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;

    // PR #85 — Load MSA pool + compute cohort rent trajectory for
    // the chart overlay on Page 4. Same pattern as the live page
    // (src/app/property-managers/[state]/[city]/[slug]/page.tsx),
    // just reused here so the PDF can show the operator-vs-cohort
    // overlay. Fails open: if the pool query errors, we still
    // render the chart with operator bars only.
    let cohortTrajectory = null;
    try {
      const msaPool = await loadMsaPool(scorecard.market.id);
      cohortTrajectory = buildCohortRentTrajectory(scorecard, msaPool);
    } catch (poolErr) {
      console.error(
        "[scorecard-pdf] msaPool load / cohort trajectory failed; rendering chart without overlay",
        poolErr,
        { slug }
      );
    }

    const buffer = await renderToBuffer(
      <OperatorProfilePDF
        scorecard={scorecard}
        cohortTrajectory={cohortTrajectory}
      />
    );

    // Trigger a download with a stable filename. The dwellsy-iq-
    // prefix makes the file recognizable in deal-room folders where
    // it'll sit alongside other operator artifacts.
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dwellsy-iq-${slug}.pdf"`,
        // Cache for an hour at the edge so re-downloads in the same
        // session don't re-render. The PDF content is deterministic
        // for a given seed version + slug, so longer caching is
        // safe in principle; an hour is conservative and aligns
        // with how often someone might want a re-rendered artifact.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    // Always surface to Vercel logs first (PR #77 pattern — Sentry
    // can fail to load and we still want diagnostic ground truth).
    console.error(
      "[scorecard-pdf] render error",
      err,
      { slug }
    );
    try {
      Sentry.captureException(err, {
        tags: { component: "scorecard-pdf" },
        extra: { slug },
      });
    } catch {
      // Sentry capture itself failed — already logged the real error
      // above, nothing useful to do here.
    }
    return new Response("Failed to render scorecard PDF", { status: 500 });
  }
}
