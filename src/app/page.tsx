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
import { fmtNumber } from "@/lib/format";
import type { ScorecardData, StarLevel } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dwellsy IQ — Property Manager Intelligence",
  description:
    "Outside-in scorecards on every property manager in the country. Methodology v0.6.3 + design v1.0 — 7 markets live across 573 eligible operators. Lease velocity, tenancy, rent performance, marketing, community visibility, and lending signals. Built for institutional diligence.",
  openGraph: {
    title: "Dwellsy IQ — Property Manager Intelligence",
    description:
      "Outside-in scorecards on property managers. v0.6.3 + v1.0 across 7 covered markets. Built for institutional diligence.",
    type: "website",
  },
};

// Per-market sample-operator manifest. One operator per market — selected
// to surface the v0.6.2 + v1.0 story (composite star tiers, multi-market
// presence, 7-cell taxonomy diversity). The query falls back gracefully if
// a slug isn't found in the seed.
const SAMPLE_MANIFEST: Array<{
  marketId: string;
  slug: string;
  quote: string;
  /** Optional context-specific badge override (e.g. "Publicly traded"). */
  extraBadge?: { kind: "green" | "orange" | "teal" | "ink"; label: string };
}> = [
  {
    marketId: "chattanooga-tn",
    slug: "brookside-properties-chattanooga-tn",
    quote:
      "Six-day median DOM, comprehensive community visibility at 2.54× the cohort norm — a structurally transparent multifamily operator in Chattanooga.",
  },
  {
    marketId: "jacksonville-fl",
    slug: "invitation-homes-jacksonville-fl",
    quote:
      "Largest scattered-site SFR operator in our coverage — institutional under the cross-market scale rule. Community visibility is suppressed by design for SFR.",
    extraBadge: { kind: "teal", label: "Publicly traded REIT" },
  },
  {
    marketId: "nashville-davidson-murfreesboro-franklin-tn",
    slug: "udr-nashville-tn",
    quote:
      "National Class A multifamily operator — the institutional baseline. 8 observed communities totaling ~2,400 units; comprehensive Community Visibility at 1.43×.",
    extraBadge: { kind: "teal", label: "Publicly traded REIT" },
  },
  {
    marketId: "memphis-tn-ms-ar",
    slug: "reedy-company-memphis-tn",
    quote:
      "Memphis-anchored SFR institutional — 811 distinct units observed listing in trailing 12 months across 766 addresses. The local equivalent of Invitation Homes at MSA scale.",
  },
  {
    marketId: "knoxville-tn",
    slug: "mission-rock-residential-knoxville-tn",
    quote:
      "Multi-market Class A operator visible in 5 of our covered markets. Gold composite star in Knoxville cohort despite a single observed community — top-quartile marketing discipline.",
  },
  {
    marketId: "clarksville-tn-ky",
    slug: "byers-harvey-clarksville-tn-ky",
    quote:
      "Fort Campbell-anchored scattered-site SFR institutional. 828 units observed across 420 addresses — a regionally-concentrated SFR portfolio defined by the base economy.",
  },
  {
    marketId: "phoenix-az",
    slug: "mark-taylor-phoenix-az",
    quote:
      "Phoenix multifamily leader — 1,504 units observed across 8 communities, rank 5 of 165 in the Phoenix MSA. Gold composite star in Large MF/BTR fallback cohort.",
  },
];

async function loadSampleCards(): Promise<SampleCard[]> {
  const pms = await prisma.pM.findMany({
    where: { slug: { in: SAMPLE_MANIFEST.map((m) => m.slug) } },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      quadrant7Cell: true,
      hybrid: true,
      rankOverall: true,
      rankOverallTotal: true,
      scorecardData: true,
      market: { select: { city: true, state: true, fullName: true } },
    },
  });

  // Preserve the manifest order so cards render Chattanooga → Phoenix in a
  // deterministic sequence regardless of Prisma row order.
  const cards: SampleCard[] = [];
  for (const entry of SAMPLE_MANIFEST) {
    const pm = pms.find((p) => p.slug === entry.slug);
    if (!pm) continue;
    const sc = JSON.parse(pm.scorecardData) as ScorecardData;
    const compositeStar: StarLevel = sc.rank.compositeStar ?? null;

    // Badges: 7-cell type → ink/teal pill; Institutional/Independent → green/orange.
    const badges: SampleCard["badges"] = [];
    const q7 = pm.quadrant7Cell ?? sc.pm.quadrant ?? "";
    const isInst = /Institutional/i.test(q7);
    badges.push({
      kind: isInst ? "green" : "orange",
      label: isInst ? "Institutional" : "Independent",
    });
    const typeLabel = /SFR|Scattered/i.test(q7)
      ? "Scattered SFR"
      : /Large MF/i.test(q7)
        ? "Large MF/BTR"
        : /Small MF/i.test(q7)
          ? "Small MF/BTR"
          : /Hybrid/i.test(q7)
            ? "Hybrid"
            : "MF/BTR";
    badges.push({ kind: "ink", label: typeLabel });
    if (entry.extraBadge) badges.push(entry.extraBadge);

    const stateSlug = stateCodeToSlug(pm.market.state);
    const cityKebab = citySlug(pm.market.city);
    const href = `/property-managers/${stateSlug}/${cityKebab}/${pm.slug}?unlocked=true`;

    // Stats — DOM, Composite, Units observed, Rank within cohort.
    const stats: SampleCard["stats"] = [
      {
        label: "Median DOM",
        value: `${fmtNumber(sc.performance.domT12, 1)} days`,
      },
      {
        label: "Composite",
        value: sc.rank.composite !== null ? sc.rank.composite.toFixed(1) : "—",
      },
      {
        label: "Units · T12",
        value: fmtNumber(sc.coverage.urusT12, 0),
      },
      {
        label: "Rank",
        value:
          pm.rankOverall !== null && pm.rankOverallTotal !== null
            ? `${pm.rankOverall} / ${pm.rankOverallTotal}`
            : "—",
      },
    ];

    cards.push({
      slug: pm.slug,
      href,
      rankLabel: "Composite",
      rankValue:
        sc.rank.composite !== null ? sc.rank.composite.toFixed(1) : "—",
      rankContext: `· ${pm.market.city} MSA`,
      name: pm.name,
      badges,
      compositeStar,
      quote: entry.quote,
      stats,
    });
  }
  return cards;
}

export default async function HomePage() {
  // Live markets — derived from the Market table; the homepage only renders
  // those whose underlying data is published.
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

  // Pick an example PM slug for the operator-claim callout (first live PM).
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
      <MethodologyFooter
        version="0.6.2"
        designVersion="v1.0"
        dataAsOf={dataAsOf}
      />
    </main>
  );
}
