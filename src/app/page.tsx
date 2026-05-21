import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { Hero } from "@/components/homepage/Hero";
import { MethodologyPillars } from "@/components/homepage/MethodologyPillars";
import {
  CoveredMarkets,
  type LiveMarket,
} from "@/components/homepage/CoveredMarkets";
import {
  SampleScorecards,
  type SampleCard,
} from "@/components/homepage/SampleScorecards";
import { OperatorCTA } from "@/components/homepage/OperatorCTA";
import { InstitutionCTA } from "@/components/homepage/InstitutionCTA";
import { MethodologyFooter } from "@/components/homepage/MethodologyFooter";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { fmtInt, fmtNumber } from "@/lib/format";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";
import type { ScorecardData, StarLevel } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dwellsy IQ — Property Manager Intelligence",
  description:
    "Outside-in scorecards on every property manager in the country. Portfolio scale, operator type, operating signals, market footprint. Built for institutional acquisition diligence.",
  openGraph: {
    title: "Dwellsy IQ — Property Manager Intelligence",
    description:
      "Outside-in scorecards on property managers. Portfolio scale, operator type, operating signals, market footprint. Built for institutional acquisition diligence.",
    type: "website",
  },
};

// PR #46 — paréd back to the three operators the hero quadrant
// also features, so the sample cards and the hero visual reference
// the same operator set. Each operator covers a distinct cell of
// the 7-cell taxonomy to surface the diversity of the universe.
const SAMPLE_MANIFEST: Array<{
  marketId: string;
  slug: string;
  quote: string;
  extraBadge?: { kind: "green" | "orange" | "teal" | "ink"; label: string };
}> = [
  {
    marketId: "chattanooga-tn",
    slug: "brookside-properties-chattanooga-tn",
    quote:
      "Six-day median DOM and comprehensive community visibility at 2.54× the cohort norm — a structurally transparent multifamily independent operating at scale.",
  },
  {
    marketId: "jacksonville-fl",
    slug: "invitation-homes-jacksonville-fl",
    quote:
      "Largest scattered-site SFR operator in our coverage — institutional under the cross-market scale rule. Multi-market footprint qualifies for the canonical rollup.",
    extraBadge: { kind: "teal", label: "Publicly traded REIT" },
  },
  {
    marketId: "nashville-davidson-murfreesboro-franklin-tn",
    slug: "udr-nashville-tn",
    quote:
      "National Class A multifamily — the institutional baseline. Eight observed communities totaling ~2,400 units; comprehensive Community Visibility at 1.43× cohort.",
    extraBadge: { kind: "teal", label: "Publicly traded REIT" },
  },
];

/** PR #46 — friendlier 7-cell labels for the ink pill. The seed
 *  stores the canonical Quadrant7CellKey strings ("SFR Independent",
 *  etc.); we surface them verbatim, falling back to the legacy
 *  5-cell label if a row hasn't been re-seeded. */
function sevenCellLabel(q7: string | null | undefined, fallback: string): string {
  if (typeof q7 === "string" && q7.length > 0) return q7;
  // Map the legacy 5-cell labels into rough 7-cell equivalents so
  // we never render "Scattered SFR" or "MF/BTR" without a Inst/Indep
  // dimension.
  const norm = fallback.toLowerCase();
  if (norm.includes("hybrid")) return "Hybrid";
  if (norm.includes("scattered") && norm.includes("institutional"))
    return "SFR Institutional";
  if (norm.includes("scattered")) return "SFR Independent";
  if (norm.includes("mf") && norm.includes("institutional"))
    return "Large MF/BTR Institutional";
  if (norm.includes("mf")) return "Large MF/BTR Independent";
  return fallback;
}

async function loadSampleCards(): Promise<SampleCard[]> {
  const pms = await prisma.pM.findMany({
    where: { slug: { in: SAMPLE_MANIFEST.map((m) => m.slug) } },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      quadrant7Cell: true,
      hybrid: true,
      claimed: true,
      scorecardData: true,
      market: { select: { city: true, state: true, fullName: true } },
    },
  });

  const cards: SampleCard[] = [];
  for (const entry of SAMPLE_MANIFEST) {
    const pm = pms.find((p) => p.slug === entry.slug);
    if (!pm) continue;
    const sc = JSON.parse(pm.scorecardData) as ScorecardData;
    const compositeStar: StarLevel = sc.rank.compositeStar ?? null;
    const q7Label = sevenCellLabel(pm.quadrant7Cell, pm.quadrant);

    // PR #46 — badges in 7-cell vocabulary. The Independent /
    // Institutional dimension comes through as the green/orange
    // pill; the 7-cell taxonomy cell ("SFR Independent" etc.)
    // takes the dark ink pill.
    const badges: SampleCard["badges"] = [];
    const isInst = /Institutional/i.test(q7Label);
    badges.push({
      kind: isInst ? "green" : "orange",
      label: isInst ? "Institutional" : "Independent",
    });
    badges.push({ kind: "ink", label: q7Label });
    if (entry.extraBadge) badges.push(entry.extraBadge);

    const stateSlug = stateCodeToSlug(pm.market.state);
    const cityKebab = citySlug(pm.market.city);
    const href = `/property-managers/${stateSlug}/${cityKebab}/${pm.slug}?unlocked=true`;

    // PR #46 — Rank stat dropped from the sample card stat grid.
    // Replaced with Est. Portfolio (v0.7 estimator output) which
    // is the acquirer-relevant scale signal. Portfolio range
    // surfaces underneath when the estimator carries low/high.
    const portfolio = sc.portfolioEstimate;
    const portfolioValue =
      portfolio?.status === "estimated" && typeof portfolio.point === "number"
        ? typeof portfolio.low === "number" && typeof portfolio.high === "number"
          ? `${fmtInt(portfolio.point)} (${fmtInt(portfolio.low)}–${fmtInt(portfolio.high)})`
          : `${fmtInt(portfolio.point)} units`
        : "—";

    const stats: SampleCard["stats"] = [
      {
        label: "Est. portfolio",
        value: portfolioValue,
      },
      {
        label: "URUs · T12",
        value: fmtNumber(sc.coverage.urusT12, 0),
      },
      {
        label: "Median DOM",
        value: `${fmtNumber(sc.performance.domT12, 1)} days`,
      },
      {
        label: "Composite",
        value: sc.rank.composite !== null ? sc.rank.composite.toFixed(1) : "—",
      },
    ];

    cards.push({
      slug: pm.slug,
      href,
      marketLabel: `${pm.market.city} MSA`,
      name: pm.name,
      badges,
      compositeStar,
      claimed: pm.claimed,
      quote: entry.quote,
      stats,
    });
  }
  return cards;
}

export default async function HomePage() {
  const marketRows = await prisma.market.findMany({
    orderBy: { city: "asc" },
    include: {
      pms: {
        select: { dataAsOf: true },
        orderBy: { dataAsOf: "desc" },
        take: 1,
      },
    },
  });

  const liveMarkets: LiveMarket[] = marketRows.map((m) => ({
    id: m.id,
    city: m.city,
    state: m.state,
    fullName: m.fullName,
    operatorCountTotal: m.operatorCountTotal,
    operatorCountEligible: m.operatorCountEligible,
    medianDomT12: m.medianDomT12,
    dataAsOf:
      m.pms[0]?.dataAsOf.toISOString().split("T")[0] ?? "2026-05-17",
  }));

  // Sample slug for the operator-claim callout (first live PM).
  const samplePm = await prisma.pM.findFirst({
    where: { rankOverall: 1 },
    select: { slug: true },
  });
  const claimSlug = samplePm?.slug ?? "brookside-properties-chattanooga-tn";

  const dataAsOf = liveMarkets[0]?.dataAsOf ?? "2026-05-17";
  const sampleCards = await loadSampleCards();

  return (
    <main className="bg-[#FBFAF6]">
      <TrackEvent
        event="market_page_view"
        properties={{ source: "homepage", page: "home" }}
      />
      <Hero />
      <MethodologyPillars />
      <CoveredMarkets markets={liveMarkets} />
      <SampleScorecards cards={sampleCards} />
      <OperatorCTA samplePmSlug={claimSlug} />
      <InstitutionCTA />
      {/* PR #46 — version strings now sourced from src/lib/version.ts
          so home page, footer, and any other stamp can't drift. */}
      <MethodologyFooter
        version={METHODOLOGY_VERSION.replace(/^v/, "")}
        designVersion={DESIGN_VERSION}
        dataAsOf={dataAsOf}
      />
    </main>
  );
}
