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
import { buildLendingSignals } from "@/lib/lending-signals";
import { loadMarketFootprint } from "@/lib/cross-market";
import { buildShareTrajectoryView } from "@/lib/share-trajectory";
import type { ScorecardData } from "@/lib/types";
import type { LendingSignals } from "@/lib/lending-signals";
import type { ShareTrajectoryView } from "@/lib/share-trajectory";
import type { CohortRentTrajectory } from "@/lib/cohort-rent-trajectory";

// PR #88 — Mapbox Static Images API integration. The previous SVG
// dot-map (PRs #85-#87) gave us positioning + city labels but had
// no actual geographic reference (no streets, no water, no state
// boundaries) — readers saw "dots on a gray rectangle", not a map
// of the Chattanooga area. Mapbox's Static Images API returns a
// real map PNG that we can embed as <Image> in the PDF. Same
// access token the live page already uses (NEXT_PUBLIC_MAPBOX_TOKEN).
//
// We sample down to PIN_LIMIT operator points to keep the URL
// under Mapbox's 8KB limit AND to keep the visual readable (64
// pin teardrops would overlap into a blob). The sampled pins
// still convey "operator covers this geographic area" without
// any one cluster dominating.
const PIN_LIMIT = 35;
const MAP_W = 500;
const MAP_H = 240;

async function fetchScorecardMap(
  scorecard: ScorecardData
): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.warn(
      "[scorecard-pdf] NEXT_PUBLIC_MAPBOX_TOKEN missing — skipping map render"
    );
    return null;
  }
  const points = scorecard.geographicCoverage?.coverageMapPoints ?? [];
  if (points.length === 0) return null;

  // Sample down to PIN_LIMIT points with even-stride sampling so
  // the visual still represents the full footprint shape rather
  // than just the first N listings.
  const stride = Math.max(1, Math.ceil(points.length / PIN_LIMIT));
  const sampled = points.filter((_, i) => i % stride === 0).slice(0, PIN_LIMIT);

  // pin-s is the smallest Mapbox pin style (15×30 px). Teal fill
  // matches our brand palette (#1b6e8c). The auto-position fits
  // all pins in the image with reasonable padding.
  const pinOverlay = sampled
    .map((p) => `pin-s+1b6e8c(${p.lon.toFixed(4)},${p.lat.toFixed(4)})`)
    .join(",");

  // light-v11 is Mapbox's clean light style — subtle gray streets,
  // light water, no heavy decoration. Matches our brand aesthetic
  // and stays readable next to the brand-colored operator pins.
  // padding=30 keeps the outermost pins ~30px from the image edge.
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `${pinOverlay}/auto/${MAP_W}x${MAP_H}@2x` +
    `?access_token=${token}&padding=30&attribution=false&logo=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        "[scorecard-pdf] Mapbox Static API non-OK response",
        { status: response.status, slug: scorecard.pm.slug }
      );
      return null;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (err) {
    console.error(
      "[scorecard-pdf] Mapbox Static API fetch failed",
      err,
      { slug: scorecard.pm.slug }
    );
    return null;
  }
}

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

    // PR #85 — Load MSA pool for the cohort overlay on Page 4.
    // PR #86 — Extended to also compute the full LendingSignals
    // (Page 3) + ShareTrajectoryView (Page 5) since both depend on
    // msaPool. Same pattern + same queries the live scorecard page
    // already runs. All three are wrapped in try/catch so a partial
    // failure (e.g., share trajectory cohort empty) doesn't take
    // down the whole PDF — the failing section just renders without
    // its enriched data.
    let cohortTrajectory: CohortRentTrajectory | null = null;
    let lendingSignals: LendingSignals | null = null;
    let shareTrajectory: ShareTrajectoryView | null = null;
    try {
      const msaPool = await loadMsaPool(scorecard.market.id);
      cohortTrajectory = buildCohortRentTrajectory(scorecard, msaPool);
      // marketFootprint is the operator's cross-market footprint
      // (one row per MSA they appear in). buildLendingSignals
      // uses the length to compute the operatorStability signal
      // (multi-market presence indicator).
      const marketFootprint = await loadMarketFootprint({
        name: scorecard.pm.name,
        currentSlug: slug,
      });
      lendingSignals = buildLendingSignals(
        scorecard,
        msaPool,
        marketFootprint.length
      );
      shareTrajectory = await buildShareTrajectoryView(
        scorecard,
        slug,
        msaPool
      );
    } catch (poolErr) {
      console.error(
        "[scorecard-pdf] msaPool / lending signals / share trajectory load failed; rendering PDF with reduced enrichment",
        poolErr,
        { slug }
      );
    }

    // PR #88 — Fetch the Mapbox static map for the geographic
    // coverage section. Wrapped in its own try inside fetchScorecardMap
    // — failure returns null and the PDF falls back to the SVG-based
    // dot map (PRs #85-#87).
    const mapImageDataUrl = await fetchScorecardMap(scorecard);

    const buffer = await renderToBuffer(
      <OperatorProfilePDF
        scorecard={scorecard}
        cohortTrajectory={cohortTrajectory}
        lendingSignals={lendingSignals}
        shareTrajectory={shareTrajectory}
        mapImageDataUrl={mapImageDataUrl}
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
