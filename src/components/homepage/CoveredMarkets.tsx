import Link from "next/link";
import { HomepageSectionHead } from "./SectionHead";
import { countAsWord } from "@/lib/format-count";
import { MarketsCoverageMap } from "@/components/markets/MarketsCoverageMap";

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

export function CoveredMarkets({ markets }: { markets: LiveMarket[] }) {
  // v0.6.4 Patch 11 — the section now leads with the coverage map
  // instead of a card per market. At 30+ markets the card grid had
  // become a wall; the map is the same component the /markets page
  // uses, scales as we keep adding markets, and never goes stale (its
  // live/available dots derive from the seed). The "rolling out 2026"
  // future-market cards were dropped in the same pass — they were a
  // hand-maintained list that stranded live markets (Dallas-Fort Worth)
  // as "coming soon" once they shipped. Per-market stat detail still
  // lives on /markets and each market page.
  const count = markets.length;
  const countWord = countAsWord(count);
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Coverage"
          title={`${countWord} markets currently live on Dwellsy IQ.`}
          context={`We launch a market when the underlying Dwellsy listing record is deep enough to support cohort-relative ranking with a defensible eligibility threshold. ${countWord} MSAs are live today, and we can stand up any of the top 200 US markets on request — no waiting.`}
        />

        {/* Desktop: the interactive coverage map (the component hides
            itself below the md breakpoint). */}
        <div className="mt-10">
          <MarketsCoverageMap />
        </div>

        {/* Mobile fallback — the map is hidden at phone widths, so give
            a compact entry point into the full market list. */}
        <div className="md:hidden">
          <div className="rounded-md border border-grid bg-white p-7 text-center">
            <p className="text-[40px] font-semibold leading-none tracking-[-0.01em] text-navy dq-tnum">
              {count}
            </p>
            <p className="mt-2 text-[14.5px] text-muted-foreground">
              live markets across the United States
            </p>
            <Link
              href="/property-managers"
              className="mt-5 inline-flex h-10 items-center rounded-md bg-navy px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-700"
            >
              Explore all markets →
            </Link>
          </div>
        </div>

        <p className="mt-9 max-w-[760px] text-[14.5px] italic leading-[1.6] text-muted-foreground">
          Any of the top 200 US markets can be stood up on request.{" "}
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
