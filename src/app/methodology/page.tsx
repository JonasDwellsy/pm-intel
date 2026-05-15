import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Dwellsy IQ scores property managers: operator classification, days-on-market, rent trajectory, listing quality, coverage confidence, and tenancy retention.",
};

async function loadVersion() {
  const sample = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
    orderBy: { dataAsOf: "desc" },
  });
  return sample
    ? {
        version: sample.methodologyVersion,
        dataAsOf: sample.dataAsOf.toISOString().slice(0, 10),
      }
    : { version: "—", dataAsOf: "—" };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

export default async function MethodologyPage() {
  const { version, dataAsOf } = await loadVersion();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Methodology {version}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          How Dwellsy IQ scores property managers
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Independent, data-driven scorecards built from observed Dwellsy
          listing activity. No paid placement, no operator-reported
          self-disclosures — every metric is derived from the same raw listing
          stream. Current snapshot reflects data as of {fmtDate(dataAsOf)}.
        </p>
      </header>

      <nav className="mb-10 rounded-md border border-border bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {[
            ["classification", "Operator classification"],
            ["dom", "Days on market"],
            ["rent-trajectory", "Rent trajectory"],
            ["pricing", "Pricing"],
            ["listing-quality", "Listing quality"],
            ["coverage", "Coverage confidence"],
            ["tenancy", "Tenancy retention"],
            ["ranking", "Ranking"],
            ["glossary", "Glossary"],
            ["versioning", "Versioning & freshness"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-10">
        <Section id="classification" title="Operator classification">
          <p>
            Each operator is placed on a 2×2 grid built from two axes:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Asset class</strong> — MF / BTR (institutional-style
              multifamily and build-to-rent) versus Scattered Site (single-
              family, condo, small multifamily distributed across many
              addresses).
            </li>
            <li>
              <strong>Operating axis</strong> — Institutional versus
              Independent. Institutional is defined by buildings exceeding the
              50-unit threshold or scattered books exceeding institutional
              scale (~1,000 units). Independent is everything below those
              cutoffs.
            </li>
          </ul>
          <p>
            A small subset of operators straddle quadrants — measurable books
            on both sides of one axis. Those are flagged as <em>Hybrid</em>{" "}
            and listed under the closer quadrant. Classification reflects only
            the observed MSA data; an operator may run a different mix in
            other markets.
          </p>
        </Section>

        <Section id="dom" title="Days on market (DOM)">
          <p>
            Days on market is the median time from a unit being listed to
            being marked unavailable, computed at the unit-rental-unit level
            (URU). We report three windows:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>DOM T12</strong> — trailing twelve months. Primary
              ranking input.
            </li>
            <li>
              <strong>DOM lifetime</strong> — all observed listings, weighted
              by URU count.
            </li>
            <li>
              <strong>DOM by asset class</strong> — houses vs apartments,
              shown separately when each cohort has sufficient N (≥20 URUs).
            </li>
          </ul>
          <p>
            Each PM's DOM is reported alongside the peer-quadrant median and
            the MSA-wide median, so the gap is interpretable.
          </p>
        </Section>

        <Section id="rent-trajectory" title="Rent trajectory">
          <p>
            For each year a PM was active, we compute the median rent premium
            (or discount) of their listings versus comparable units in the
            same MSA — controlling for asset class, bedroom count, and
            geography. A premium of +5% means listings priced 5% above the
            market-comparable median.
          </p>
          <p>
            The chart shows the five-year trajectory; the n-label on each bar
            is the number of listings underlying that year's median. Years
            with fewer than 50 listings are flagged.
          </p>
        </Section>

        <Section id="pricing" title="Pricing">
          <p>
            Three derived statistics from the rent comparison set:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>T12 median premium</strong> — the headline rent
              positioning.
            </li>
            <li>
              <strong>% above market by ≥10%</strong> and{" "}
              <strong>% below market by ≥10%</strong> — fraction of T12
              listings in each tail. High tails on either side suggest
              specialization or mismatched comp set.
            </li>
            <li>
              <strong>Concession rate</strong> — share of T12 listings with an
              advertised concession (free month, look-and-lease credit, etc.),
              compared against the MSA-wide rate.
            </li>
          </ul>
        </Section>

        <Section id="listing-quality" title="Listing quality">
          <p>
            Each listing is scored 0–5 on a composite completeness score
            built from photo count, amenities mentioned, description length,
            and structured-data presence. We surface three rollups:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Composite completeness score (0–5).</li>
            <li>Average amenities mentioned per listing.</li>
            <li>Median description length in characters.</li>
          </ul>
          <p>
            Comparison is always against the median operator in the same
            quadrant — not the whole MSA — so institutional PMs aren't being
            compared against scattered-site mom-and-pops.
          </p>
        </Section>

        <Section id="coverage" title="Coverage confidence">
          <p>
            Whether the observed Dwellsy listing volume matches what would be
            expected for a portfolio of this size and composition. We compute
            an <strong>observed listing intensity</strong> (listings per
            building per year) and an <strong>expected intensity</strong>{" "}
            (based on building size and turnover rates), and report their{" "}
            <strong>ratio</strong>.
          </p>
          <p>
            A ratio near 1.0 indicates we likely see the full book. Ratios
            substantially below 1.0 mean the scorecard may be partial — the
            operator likely lists elsewhere too. Ratios well above 1.0 are
            consistent with whole-property leasing operations and high
            turnover.
          </p>
        </Section>

        <Section id="tenancy" title="Tenancy retention">
          <p>
            For units that we observe more than once on the platform (i.e.,
            relisted after a prior lease), we measure the months between the
            prior lease end and the new listing. The PM's median is compared
            against the cohort of comparable operators (same asset class,
            similar scale), reported with the cohort's p25–p75 range.
          </p>
          <p>
            <em>At cohort low end (p25)</em>, <em>within cohort range</em>,{" "}
            <em>below cohort range</em>, and <em>above cohort range</em> are
            position labels relative to that distribution. Higher tenancy is
            generally better (lower turnover, fewer vacancy gaps).
          </p>
        </Section>

        <Section id="ranking" title="Ranking">
          <p>
            Overall ranking is a composite of: DOM T12 vs peer-quadrant
            median (40%), rent trajectory premium (20%), tenancy gap (20%),
            listing quality completeness (10%), and coverage confidence
            (10%). Each input is normalized within the MSA before weighting.
          </p>
          <p>
            Operators with insufficient data on any axis (e.g., a young
            operator with under 50 T12 listings) are tagged{" "}
            <em>Limited tier</em> and excluded from headline ranking, but
            still receive a partial scorecard.
          </p>
        </Section>

        <Section id="glossary" title="Glossary">
          <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-[180px_1fr] sm:gap-x-6">
            <dt className="font-medium">URU</dt>
            <dd className="text-muted-foreground">
              Unit-rental-unit. The basic counting unit; one URU corresponds
              to one physical unit being listed in one rental cycle.
            </dd>
            <dt className="font-medium">DOM T12</dt>
            <dd className="text-muted-foreground">
              Median days on market across the trailing 12 months of listings.
            </dd>
            <dt className="font-medium">Quadrant</dt>
            <dd className="text-muted-foreground">
              The 2×2 classification cell (asset class × operating axis) the
              operator falls into.
            </dd>
            <dt className="font-medium">Peer median</dt>
            <dd className="text-muted-foreground">
              The median value across other operators in the same quadrant in
              the same MSA, weighted by URU count.
            </dd>
            <dt className="font-medium">Hybrid operator</dt>
            <dd className="text-muted-foreground">
              An operator with measurable books in two adjacent quadrants;
              listed under the closer of the two.
            </dd>
          </dl>
        </Section>

        <Section id="versioning" title="Versioning & freshness">
          <p>
            Methodology is versioned (currently <strong>{version}</strong>).
            Each scorecard cites the methodology version that produced it
            plus the data freshness date. Material changes — new metrics,
            re-weightings, threshold shifts — bump the version. Cosmetic
            changes do not.
          </p>
          <p>
            Data is refreshed monthly. The current snapshot reflects listing
            activity through {fmtDate(dataAsOf)}.
          </p>
        </Section>
      </div>
    </main>
  );
}
