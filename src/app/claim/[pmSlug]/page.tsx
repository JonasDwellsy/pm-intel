import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { ClaimForm } from "@/components/claim/ClaimForm";
import { OperatorContextCard } from "@/components/claim/OperatorContextCard";
import { BenefitTiles } from "@/components/claim/BenefitTiles";
import { PricingCallout } from "@/components/claim/PricingCallout";
import { QuadrantBadge } from "@/components/claim/QuadrantBadge";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { TrackEvent } from "@/components/analytics/TrackEvent";

// Claim Landing — the property-manager-side entry point reached when an
// operator clicks "Claim this profile" from a public scorecard. Single-column,
// 640px reading measure on cream. Three states drive the layout:
//   - default          → form card
//   - already claimed  → message card in place of the form
//   - submitted        → success card (handled inside ClaimForm)
// Header/footer come from the root layout and stay unchanged.

type RouteParams = { pmSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { pmSlug } = await params;
  const pm = await prisma.pM.findUnique({
    where: { slug: pmSlug },
    select: { name: true },
  });
  if (!pm) return { title: "Claim — not found" };
  return {
    title: `Claim ${pm.name}`,
    description: `Claim and manage the Dwellsy IQ profile for ${pm.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { pmSlug } = await params;
  const pm = await prisma.pM.findUnique({
    where: { slug: pmSlug },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      claimed: true,
      rankOverall: true,
      rankOverallTotal: true,
      rankQuadrant: true,
      rankQuadrantTotal: true,
      scorecardData: true,
      market: { select: { state: true, city: true, fullName: true } },
    },
  });
  if (!pm) notFound();

  // The PM model carries overall/quadrant rank columns directly, but the
  // quadrant median DOM lives only inside scorecardData.rank. Parse once.
  const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;

  const scorecardHref = `/property-managers/${stateCodeToSlug(pm.market.state)}/${citySlug(pm.market.city)}/${pm.slug}`;

  const rankOverall =
    pm.rankOverall !== null && pm.rankOverallTotal !== null
      ? { rank: pm.rankOverall, of: pm.rankOverallTotal }
      : null;
  const rankQuadrant =
    pm.rankQuadrant !== null && pm.rankQuadrantTotal !== null
      ? { rank: pm.rankQuadrant, of: pm.rankQuadrantTotal }
      : null;
  const medianDomT12 = scorecard.rank?.quadrantMedianDomT12 ?? null;

  return (
    <main className="bg-cream">
      <TrackEvent
        event="claim_landing_view"
        properties={{ pmSlug: pm.slug, claimed: pm.claimed }}
      />
      <div className="mx-auto max-w-[640px] px-8 pb-24 pt-20 max-md:px-5 max-md:pb-16 max-md:pt-10">
        {/* Title block — centered on desktop, left-aligned on mobile. */}
        <section className="flex flex-col items-center gap-4 text-center max-md:items-start max-md:gap-3 max-md:text-left">
          <span className="dq-eyebrow">
            Dwellsy IQ · Property Manager Portal
          </span>
          <h1 className="dq-h1">Claim your profile for {pm.name}.</h1>
          <p className="dq-lede">
            Your operating data is already in Dwellsy IQ. Claim your profile
            to review your scorecard, respond to the data, receive
            owner-matched leads, and access competitive intelligence.
          </p>
        </section>

        {/* Operator context card */}
        <OperatorContextCard
          name={pm.name}
          market={pm.market.fullName}
          quadrant={pm.quadrant}
          rankOverall={rankOverall}
          rankQuadrant={rankQuadrant}
          medianDomT12={medianDomT12}
          scorecardHref={scorecardHref}
        />

        {/* Benefit tiles */}
        <BenefitTiles />

        {/* Form card OR already-claimed message */}
        <section className="mt-[72px] flex justify-center max-md:mt-12">
          {pm.claimed ? (
            <AlreadyClaimedCard quadrant={pm.quadrant} pmName={pm.name} />
          ) : (
            <ClaimForm
              pmSlug={pm.slug}
              pmName={pm.name}
              scorecardHref={scorecardHref}
            />
          )}
        </section>

        {/* Pricing transparency callout */}
        <PricingCallout />

        {/* Already-claimed sign-in line */}
        <p className="mt-7 text-center text-[13.5px] text-muted-foreground">
          Already claimed your profile?{" "}
          <Link
            href="/methodology"
            className="font-medium text-teal hover:text-teal-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

// Shown in place of the form when pm.claimed is true. Keeps the same card
// chrome as the form so the column rhythm doesn't shift, but the body is a
// short note and a contact link.
function AlreadyClaimedCard({
  quadrant,
  pmName,
}: {
  quadrant: string;
  pmName: string;
}) {
  return (
    <div
      className="w-full max-w-[520px] rounded-[20px] border bg-white p-9 max-md:rounded-[14px] max-md:p-6"
      style={{
        borderColor: "var(--color-warm-grid-strong)",
        boxShadow: "var(--shadow-form)",
      }}
    >
      <div className="flex items-start justify-between gap-3 max-md:flex-col max-md:gap-3">
        <span className="dq-eyebrow">Already claimed</span>
        <QuadrantBadge quadrant={quadrant} className="max-md:whitespace-normal" />
      </div>
      <h2 className="mt-3 text-[20px] font-semibold leading-tight tracking-[-0.014em] text-navy">
        {pmName} is already claimed.
      </h2>
      <p className="mt-4 text-[14.5px] leading-[1.6] text-muted-foreground">
        If you believe that&rsquo;s a mistake, email{" "}
        <a
          href="mailto:claims@dwellsy.com"
          className="font-medium text-teal hover:text-teal-700"
        >
          claims@dwellsy.com
        </a>{" "}
        and we&rsquo;ll investigate.
      </p>
    </div>
  );
}
