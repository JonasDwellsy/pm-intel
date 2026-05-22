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
  type MetricCell,
  type PortfolioBand,
} from "@/components/homepage/SampleScorecards";
import { OperatorCTA } from "@/components/homepage/OperatorCTA";
import { InstitutionCTA } from "@/components/homepage/InstitutionCTA";
import { MethodologyFooter } from "@/components/homepage/MethodologyFooter";
import { countOperatorStars } from "@/lib/operators/stars";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { fmtInt, fmtNumber, fmtPct } from "@/lib/format";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";
import { marketingDataSuppressed } from "@/lib/types";
import type { ScorecardData } from "@/lib/types";

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

// PR #53 — Sample cards reselected for the multi-star scorecard
// rebuild. Selection rules (full audit in the PR body):
//
//   - T12 URUs < 300
//   - All five headline metrics fully populated (portfolio estimate
//     present, all four cohort-relative metric values + stars
//     derivable, marketing.compositeScore not suppressed)
//   - At least one earned per-metric star
//   - 3 distinct non-Chattanooga MSAs (Doorby is the Chattanooga
//     hero card)
//   - No Institutional / REIT operators
//
// Bias was meant to be 2 SFR/MF Independents + 1 Hybrid Independent.
// In practice no Hybrid operator passes the strict-no-nulls filter
// — the v0.7 marketing-fix suppressed marketing subscores across
// several cohorts including every Hybrid one. The substitute is a
// Small MF/BTR Independent so the cell-mix stays diverse: 2 SFR
// Independents + 1 Small MF/BTR Independent.
//
// PR #53 follow-up — synthesis quotes removed. The metric grid +
// portfolio band + cohort label carry the full story in the
// homepage card format; the extra prose was repetitive and
// dropped readability rather than adding it. The full per-operator
// narrative still lives on the scorecard page.
const SAMPLE_MANIFEST: Array<{
  marketId: string;
  slug: string;
  extraBadge?: { kind: "green" | "orange" | "teal" | "ink"; label: string };
}> = [
  {
    // Montgomery SFR Independent — 3 gold + 1 silver, 61 URUs.
    // Gold composite, 88 cohort score.
    marketId: "montgomery-al",
    slug: "hwb-properties-montgomery-al",
  },
  {
    // Huntsville SFR Independent — 3 gold + 0 silver, 146 URUs.
    // Gold composite, 79.4 cohort score.
    marketId: "huntsville-al",
    slug: "newton-property-management-huntsville-al",
  },
  {
    // Birmingham Small MF/BTR Independent — 3 gold + 1 silver,
    // 40 URUs. Gold composite, 68.4 MSA cohort score.
    marketId: "birmingham-al",
    slug: "chateau-orleans-realty-company-birmingham-al",
  },
];

/** PR #46 — friendlier 7-cell labels for the ink pill. The seed
 *  stores the canonical Quadrant7CellKey strings ("SFR Independent",
 *  etc.); we surface them verbatim, falling back to the legacy
 *  5-cell label if a row hasn't been re-seeded. */
function sevenCellLabel(q7: string | null | undefined, fallback: string): string {
  if (typeof q7 === "string" && q7.length > 0) return q7;
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

/** Shape returned by the PM lookup used to build a SampleCard. Kept
 *  loose (no Prisma type import) so the helper below works for both
 *  the manifest-driven sample row and the single Doorby hero card. */
type PmForSampleCard = {
  slug: string;
  name: string;
  quadrant: string;
  quadrant7Cell: string | null;
  claimed: boolean;
  scorecardData: string;
  market: { city: string; state: string };
};

/** Compose the full-width Portfolio band shown above the metric
 *  grid. Mirrors the scorecard SynthesisLayer's EstPortfolioTile —
 *  point + range + confidence tier. The cohort qualifier the
 *  scorecard tile prints is omitted here on purpose; the 7-cell
 *  badge directly above the band already names the cohort and the
 *  third segment was reading as repetition. */
function buildPortfolioBand(
  portfolio: ScorecardData["portfolioEstimate"]
): PortfolioBand {
  if (
    portfolio?.status === "estimated" &&
    typeof portfolio.point === "number"
  ) {
    const range =
      typeof portfolio.low === "number" && typeof portfolio.high === "number"
        ? `${fmtInt(portfolio.low)}–${fmtInt(portfolio.high)} units`
        : null;
    const confidence = portfolio.confidence
      ? `${portfolio.confidence} confidence`
      : "Point estimate";
    return {
      point: fmtInt(portfolio.point),
      range,
      caveat: confidence,
    };
  }
  return {
    point: "—",
    range: null,
    caveat: portfolio?.message ?? "Insufficient data",
  };
}

/** Lease-up Speed cell: median DOM (days) + delta vs cohort median.
 *  Direction is favorable when the operator is faster (lower DOM). */
function buildLeaseUpCell(
  performance: ScorecardData["performance"]
): MetricCell {
  const star = performance.domStar ?? null;
  const peerMedian =
    performance.peerQuadrantDomT12 ?? performance.marketDomT12 ?? null;
  const value = performance.domT12;
  let context = `n = ${performance.domT12N} listings`;
  if (peerMedian !== null && Number.isFinite(peerMedian)) {
    const delta = value - peerMedian;
    if (Math.abs(delta) < 0.05) {
      context = `vs cohort median ${fmtNumber(peerMedian, 1)}d`;
    } else {
      // Lower DOM is better, so a negative delta is favorable (▼).
      const arrow = delta < 0 ? "▼" : "▲";
      context = `${arrow} ${fmtNumber(Math.abs(delta), 1)}d vs cohort ${fmtNumber(peerMedian, 1)}d`;
    }
  }
  return {
    star,
    headline: fmtNumber(value, 1),
    unit: "days",
    context,
  };
}

/** Tenant Retention cell: median tenancy months + cohort delta when
 *  available (operators in some cohorts don't have apt / house p50
 *  populated; we fall back to "N units observed"). */
function buildRetentionCell(
  tenancy: ScorecardData["tenancy"]
): MetricCell {
  const star = tenancy.star ?? null;
  const value = tenancy.overallGap;
  const cohortMedian =
    tenancy.apartment?.cohortP50 ?? tenancy.house?.cohortP50 ?? null;
  let context = `${fmtInt(tenancy.totalUnits)} units observed`;
  if (value !== null && cohortMedian !== null && cohortMedian > 0) {
    const delta = value - cohortMedian;
    if (Math.abs(delta) < 0.05) {
      context = `vs cohort median ${fmtNumber(cohortMedian, 1)}mo`;
    } else {
      // Longer tenancy is better, so a positive delta is favorable (▲).
      const arrow = delta > 0 ? "▲" : "▼";
      context = `${arrow} ${fmtNumber(Math.abs(delta), 1)}mo vs cohort ${fmtNumber(cohortMedian, 1)}mo`;
    }
  }
  return {
    star,
    headline: value !== null ? fmtNumber(value, 1) : "—",
    unit: "mo median",
    context,
  };
}

/** Rent Performance cell: percentage-points vs cohort + a one-liner
 *  pairing the operator's YoY change with the cohort median's YoY
 *  change, so the reader doesn't have to recall what "pp" means. */
function buildRentCell(
  rp: ScorecardData["rentPerformance"]
): MetricCell {
  if (!rp || rp.delta === null || rp.delta === undefined) {
    return {
      star: null,
      headline: "—",
      unit: "",
      context: "Insufficient data",
    };
  }
  const deltaPp = rp.delta * 100;
  const sign = deltaPp > 0 ? "+" : "";
  const pmYoy = fmtPct(rp.pmYoyChange * 100, 1, true);
  const cohortYoy =
    typeof rp.cohortMedianYoyChange === "number"
      ? fmtPct(rp.cohortMedianYoyChange * 100, 1, true)
      : null;
  const context = cohortYoy
    ? `Operator ${pmYoy} · Cohort ${cohortYoy}`
    : `Operator ${pmYoy} YoY`;
  return {
    star: rp.star ?? null,
    headline: `${sign}${fmtNumber(deltaPp, 1)}`,
    unit: "pp vs cohort",
    context,
  };
}

/** Marketing Discipline cell: composite score / 100 + percentile in
 *  cohort. Honors the v0.7 marketing-suppression rule — operators in
 *  a suppressed cohort surface "Insufficient marketing data". */
function buildMarketingCell(
  marketing: ScorecardData["marketing"],
  percentile: number | null
): MetricCell {
  if (marketingDataSuppressed(marketing)) {
    return {
      star: null,
      headline: "—",
      unit: "",
      context: "Insufficient marketing data",
    };
  }
  return {
    star: marketing.star ?? null,
    headline: fmtNumber(marketing.compositeScore, 0),
    unit: "/ 100",
    context:
      percentile !== null
        ? `${Math.round(percentile)}th percentile`
        : "Marketing quality composite",
  };
}

/** Turn a PM row into a SampleCard ready for the homepage card UI.
 *  The per-metric star roll-up, portfolio band, and four
 *  cohort-relative cells all come from the live scorecard layer so
 *  the card stays in lock-step with whatever the scorecard hero
 *  shows for the same operator. */
function buildSampleCard(
  pm: PmForSampleCard,
  extraBadge?: SampleCard["badges"][number]
): SampleCard {
  const sc = JSON.parse(pm.scorecardData) as ScorecardData;
  const q7Label = sevenCellLabel(pm.quadrant7Cell, pm.quadrant);

  const badges: SampleCard["badges"] = [];
  const isInst = /Institutional/i.test(q7Label);
  badges.push({
    kind: isInst ? "green" : "orange",
    label: isInst ? "Institutional" : "Independent",
  });
  badges.push({ kind: "ink", label: q7Label });
  if (extraBadge) badges.push(extraBadge);

  const stateSlug = stateCodeToSlug(pm.market.state);
  const cityKebab = citySlug(pm.market.city);
  const href = `/property-managers/${stateSlug}/${cityKebab}/${pm.slug}`;

  const { goldCount, silverCount } = countOperatorStars(sc);

  return {
    slug: pm.slug,
    href,
    // "Montgomery, AL MSA" — state code disambiguates same-named
    // cities (e.g. multiple Birminghams or Phoenixes) and matches
    // the convention the rest of the surfaces use.
    marketLabel: `${pm.market.city}, ${pm.market.state} MSA`,
    name: pm.name,
    goldCount,
    silverCount,
    badges,
    claimed: pm.claimed,
    portfolio: buildPortfolioBand(sc.portfolioEstimate),
    leaseUp: buildLeaseUpCell(sc.performance),
    tenantRetention: buildRetentionCell(sc.tenancy),
    rentPerformance: buildRentCell(sc.rentPerformance),
    marketingDiscipline: buildMarketingCell(
      sc.marketing,
      // Prefer the primary-cohort percentile (the nested
      // percentilesMulti.marketing.primary) — it's the same number
      // the scorecard SynthesisLayer's Marketing tile renders.
      // Falls back to the top-level percentiles.marketing (MSA-level
      // scalar) when the multi-level shape isn't populated.
      sc.rank?.percentilesMulti?.marketing?.primary ??
        sc.rank?.percentiles?.marketing ??
        null
    ),
  };
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
    cards.push(buildSampleCard(pm, entry.extraBadge));
  }
  return cards;
}

/** Hero sample card — Doorby in Chattanooga (gold-composite SFR
 *  Independent). Replaces the v0.12 operator-type quadrant chart in
 *  the right column of the hero. The fields all come from the live
 *  scorecard layer via buildSampleCard, so the card stays in sync
 *  as the methodology / estimator drifts. */
const HERO_CARD_SLUG = "doorby-property-management-chattanooga-tn";

async function loadHeroCard(): Promise<SampleCard | null> {
  const pm = await prisma.pM.findUnique({
    where: { slug: HERO_CARD_SLUG },
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
  if (!pm) return null;
  return buildSampleCard(pm);
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
  const [sampleCards, heroCard] = await Promise.all([
    loadSampleCards(),
    loadHeroCard(),
  ]);

  return (
    <main className="bg-[#FBFAF6]">
      <TrackEvent
        event="market_page_view"
        properties={{ source: "homepage", page: "home" }}
      />
      <Hero heroCard={heroCard} />
      <MethodologyPillars />
      <CoveredMarkets markets={liveMarkets} />
      <SampleScorecards cards={sampleCards} />
      <OperatorCTA samplePmSlug={claimSlug} />
      <InstitutionCTA />
      <MethodologyFooter
        version={METHODOLOGY_VERSION.replace(/^v/, "")}
        designVersion={DESIGN_VERSION}
        dataAsOf={dataAsOf}
      />
    </main>
  );
}
