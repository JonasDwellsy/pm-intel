// PUBLIC sample scorecard — /sample
//
// A deliberately UNGATED, indexable marketing surface that renders the full
// redesigned operator scorecard for a single fixed operator (Doorby Property
// Management, Chattanooga). Logged-out visitors can't reach any real
// per-operator scorecard — those live under /property-managers/:state/:city/
// :slug and are gated by PROTECTED_ROUTE_PATTERNS (see
// src/lib/auth/protected-routes.ts + src/middleware.ts). This route is the one
// complete example we show anonymously, so a prospect can see exactly what an
// Dwellsy IQ Markets profile looks like before signing in.
//
// It is NOT listed in PROTECTED_ROUTE_PATTERNS (and never should be) — the
// middleware only gates the patterns in that list, so /sample falls through as
// public.
//
// Single-source principle: the data path here mirrors the production scorecard
// page (src/app/property-managers/[state]/[city]/[slug]/page.tsx) and the PDF
// route exactly — same msaPool, operator trajectory, market concession rate,
// and multi-market extras fed to buildScorecardView(), then handed to the same
// <ScorecardBody> — with ONE deliberate difference: NO auth / entitlement
// gate. This is a public marketing sample by design.
//
// Rendered statically (no `export const dynamic`), like the homepage, so the
// build prerenders it and any failure to build Doorby's view surfaces at build
// time rather than in production.

import type { Metadata } from "next";
import Link from "next/link";
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

// Public marketing sample — indexable is fine (it's the same content a
// prospect would see). Title mirrors the "%s · Dwellsy IQ Markets" root template only
// loosely; we set the full title here so the sample reads distinctly in search.
export const metadata: Metadata = {
  title: "Sample scorecard",
  description:
    "A complete example Dwellsy IQ Markets operator scorecard — portfolio scale, operator type, operating signals, momentum, and market footprint. One illustrative profile of the kind produced for every property manager we cover.",
  alternates: { canonical: "/sample" },
  openGraph: {
    title: "Sample scorecard",
    description:
      "A complete example Dwellsy IQ Markets operator scorecard — one illustrative profile of the kind produced for every property manager we cover.",
    type: "website",
  },
};

// Fixed hero operator — Doorby Property Management (Chattanooga), the same
// gold-composite SFR Independent used for the homepage hero card. Hardcoded on
// purpose: this is a curated marketing sample, not a dynamic slug route.
const SAMPLE_SLUG = "doorby-property-management-chattanooga-tn";

export default async function SampleScorecardPage() {
  const pm = await prisma.pM.findUnique({ where: { slug: SAMPLE_SLUG } });
  // Defensive: the slug is fixed and seeded, so this should never fire in
  // practice. If the sample operator ever disappears from the seed we 404
  // rather than render a broken/empty scorecard.
  if (!pm) notFound();

  const scorecard = parseScorecard(pm);
  const isClaimed = pm.claimed;

  // Mirror the production page's multi-market loading so the sample shows the
  // operator's real cross-market footprint. NO entitlement filter here — this
  // route is public by design, so (like the dev preview) it loads all member
  // markets rather than scoping to a viewer's entitlement.
  const isMultiMarket =
    !!scorecard.canonicalOperatorId &&
    scorecard.canonicalOperatorId !== scorecard.pm.slug;

  const [msaPool, operatorTrajectory, members] = await Promise.all([
    loadMsaPool(scorecard.market.id),
    loadOperatorTrajectory(SAMPLE_SLUG),
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

  // Market-wide concession rate for the watch-items detector (fed as
  // marketConcessionMedian — see BuildViewInput doc comment on the field name).
  const concessionContext = buildConcessionContext(scorecard, msaPool);

  // Build the redesigned view model (pure, in-memory) — the same single source
  // the production scorecard + PDF read from.
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
      {/* Sample ribbon — makes it unmistakable this is one illustrative
          example, and gives logged-out visitors an obvious path deeper into
          the product. Slim white bar over the page tint, matching the
          homepage's card-on-#FBFAF6 treatment. */}
      <div className="border-b border-grid bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[14px] leading-[1.45] text-foreground/85">
            <span className="inline-flex h-[22px] items-center rounded-full bg-navy px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
              Sample scorecard
            </span>
            <span>
              One example of what every Dwellsy IQ Markets operator profile looks like.
            </span>
          </p>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
            {/* Primary CTA — "Request access" (mailto sales), matching the
                homepage hero's primary action. Dwellsy IQ Markets is enterprise/
                invite-only, so this leads with the real conversion path
                rather than the signed-in-only watch-list builder. */}
            <Link
              href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20access"
              className="inline-flex h-10 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
            >
              Request access →
            </Link>
            {/* Secondary CTA — the per-MSA market explorer. */}
            <Link
              href="/property-managers"
              className="inline-flex h-10 items-center justify-center rounded-md border border-navy bg-white px-5 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              Browse markets →
            </Link>
          </div>
        </div>
      </div>

      <ScorecardBody
        view={scorecardView}
        scorecard={scorecard}
        isClaimed={isClaimed}
        geographicCoverage={scorecard.geographicCoverage}
        // Public marketing sample: hides the header's Copy-link +
        // Download-PDF buttons and repoints the methodology citation to
        // /sample, since all three otherwise dead-end a logged-out visitor
        // at the auth gate.
        publicSample
      />
    </main>
  );
}
