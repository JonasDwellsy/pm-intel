import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RecapCard } from "@/components/leads/RecapCard";
import { MatchResults } from "@/components/leads/MatchResults";
import { NextStepsCallout } from "@/components/leads/NextStepsCallout";

export const metadata: Metadata = {
  title: "Your matched property managers",
  robots: { index: false, follow: false },
};

function SecondaryCta({
  href,
  title,
  sub,
}: {
  href: string;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-grid bg-white p-5 transition-colors duration-150 hover:border-navy"
    >
      <span>
        <span className="block text-[14px] font-medium leading-snug text-navy">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">
          {sub}
        </span>
      </span>
      <span className="ml-3 text-[15px] text-teal" aria-hidden>
        →
      </span>
    </Link>
  );
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { leadId } = await searchParams;
  if (!leadId) notFound();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) notFound();

  // Resolve market full name from the marketId stored on the lead.
  const market = lead.marketId
    ? await prisma.market.findUnique({
        where: { id: lead.marketId },
        select: { fullName: true },
      })
    : null;

  // Hydrate the matched PM list in the order they were ranked.
  const matchedSlugs: string[] = JSON.parse(lead.matchedPms);
  const matchRows = await prisma.pM.findMany({
    where: { slug: { in: matchedSlugs } },
    select: {
      slug: true,
      name: true,
      quadrant: true,
      hybrid: true,
      rankOverall: true,
      rankQuadrant: true,
      claimed: true,
      scorecardData: true,
      market: { select: { state: true, city: true } },
    },
  });
  const matches = matchedSlugs
    .map((slug) => matchRows.find((m) => m.slug === slug))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const firstName = lead.ownerName.split(/\s+/)[0] ?? lead.ownerName;
  const shortLeadId = lead.id.length > 14 ? `${lead.id.slice(0, 14)}…` : lead.id;

  return (
    <main className="bg-[#FBFAF6]">
      <div className="mx-auto max-w-[800px] px-6 pb-20 pt-20 sm:px-8 lg:pb-28">
        {/* Success header */}
        <header className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
            Dwellsy IQ · Match confirmation
          </p>
          <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.018em] text-navy sm:text-[44px]">
            Thanks, {firstName}. Here are your three matches.
          </h1>
          <p className="mt-5 max-w-[660px] text-[16px] leading-[1.55] text-foreground/85 sm:text-[17px]">
            We sent a copy to{" "}
            <strong className="font-semibold text-navy">
              {lead.ownerEmail}
            </strong>{" "}
            with links back to this page. Reach out directly when you&apos;re
            ready — no automated outreach happens on your behalf.
          </p>
        </header>

        {/* Recap */}
        <RecapCard
          propertyType={lead.propertyType}
          unitCount={lead.unitCount}
          marketName={market?.fullName ?? null}
          preferredQuadrant={lead.preferredQuadrant ?? null}
          editHref={`/get-matched?prefill=${lead.id}`}
        />

        {/* Match list */}
        <section className="mt-12">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.014em] text-navy sm:text-[30px]">
              Your three matched operators
            </h2>
            <p className="dq-mono text-[11.5px] text-muted-foreground tracking-[0.04em]">
              <span className="hidden sm:inline">Lead · {shortLeadId}</span>
              <span className="sm:hidden">{matches.length} matches</span>
            </p>
          </div>
          <MatchResults matches={matches} leadId={lead.id} />
        </section>

        {/* Editorial diligence content */}
        <NextStepsCallout />

        {/* Secondary CTAs */}
        <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SecondaryCta
            href={
              market?.fullName
                ? `/property-managers`
                : `/property-managers`
            }
            title="Browse other operators"
            sub="in this market"
          />
          <SecondaryCta
            href="/methodology"
            title="Read our methodology"
            sub="v0.3.4"
          />
          <SecondaryCta
            href="/get-matched"
            title="Submit a new request"
            sub="different property"
          />
        </section>
      </div>
    </main>
  );
}
