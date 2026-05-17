import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { HomepageSectionHead } from "./SectionHead";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { fmtDate, fmtDays, fmtInt } from "@/lib/format";

export type LiveMarket = {
  id: string;
  city: string;
  state: string;
  fullName: string;
  operatorCountTotal: number;
  operatorCountEligible: number;
  medianDomT12: number;
  dataAsOf: string;
};

const FUTURE_MARKETS: Array<{ name: string; description: string }> = [
  {
    name: "Knoxville, TN MSA",
    description:
      "Data ingestion complete. Eligibility threshold tuning in progress; targeting Q3 launch.",
  },
  {
    name: "Atlanta, GA MSA",
    description:
      "Coverage scoping underway. Larger cohort means a slower, more conservative eligibility review.",
  },
];

function StatBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[22px] font-semibold leading-[1.2] tracking-[-0.005em] text-navy">
        {value}
      </p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function LiveMarketCard({ market }: { market: LiveMarket }) {
  const href = `/property-managers/${stateCodeToSlug(market.state)}/${citySlug(
    market.city
  )}`;
  return (
    <TrackedLink
      event="market_page_view"
      properties={{
        source: "homepage_coverage",
        marketId: market.id,
      }}
      href={href}
      className="group flex min-h-[260px] flex-col rounded-md border border-grid bg-white p-8 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)]"
    >
      <div className="mb-5 flex flex-wrap gap-2.5">
        <span className="dq-pill dq-pill-green inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          Live
        </span>
        <span className="dq-pill dq-pill-navy-soft">Pilot MSA</span>
      </div>
      <h3 className="dq-h2 mb-5 text-[22px] leading-[1.2] tracking-[-0.005em]">
        {market.fullName.replace("TN-GA", "TN–GA")}
      </h3>
      <div className="my-5 grid grid-cols-2 gap-x-7 gap-y-5">
        <StatBlock
          label="Operators"
          value={<span className="dq-tnum">{fmtInt(market.operatorCountTotal)}</span>}
          sub={`${fmtInt(market.operatorCountEligible)} eligible for ranking`}
        />
        <StatBlock
          label="Median DOM (T12)"
          value={
            <>
              <span className="dq-tnum">{market.medianDomT12.toFixed(1)}</span>
              <span className="ml-1 text-[14px] font-medium text-muted-foreground">
                days
              </span>
            </>
          }
          sub="across eligible cohort"
        />
        <StatBlock
          label="Quadrants covered"
          value={
            <>
              <span className="dq-tnum">4</span>
              <span className="ml-1 text-[14px] font-medium text-muted-foreground">
                of 4
              </span>
            </>
          }
          sub="MF/BTR + Scattered"
        />
        <StatBlock
          label="Data through"
          value={<span className="dq-tnum">{fmtDate(market.dataAsOf)}</span>}
          sub="refreshed monthly"
        />
      </div>
      <p className="mt-auto text-[13.5px] font-semibold text-teal transition-colors group-hover:text-teal-700">
        Browse property managers →
      </p>
    </TrackedLink>
  );
}

function FutureMarketCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-md border border-dashed border-[#D9D4C3] bg-transparent p-8">
      <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-2">
        Rolling out · 2026
      </p>
      <h3 className="text-[22px] font-medium leading-[1.2] tracking-[-0.005em] text-muted-foreground">
        {name}
      </h3>
      <p className="mt-3.5 text-[15px] leading-[1.55] text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function CoveredMarkets({ markets }: { markets: LiveMarket[] }) {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Coverage"
          title="Markets currently live on Dwellsy IQ."
          context="We launch a market when the underlying Dwellsy listing record is deep enough to support cohort-relative ranking with a defensible eligibility threshold. New MSAs roll out through 2026."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <LiveMarketCard key={m.id} market={m} />
          ))}
          {FUTURE_MARKETS.map((f) => (
            <FutureMarketCard
              key={f.name}
              name={f.name}
              description={f.description}
            />
          ))}
        </div>
        <p className="mt-9 max-w-[760px] text-[14.5px] italic leading-[1.6] text-muted-foreground">
          More markets rolling out in 2026.{" "}
          <span className="not-italic">
            Operating in a market we don&apos;t cover yet?{" "}
          </span>
          <Link
            href="mailto:coverage@dwellsy.com?subject=Dwellsy%20IQ%20%E2%80%94%20Coverage%20request"
            className="not-italic font-semibold text-teal hover:text-teal-700"
          >
            Tell us where you operate →
          </Link>
        </p>
      </div>
    </section>
  );
}
