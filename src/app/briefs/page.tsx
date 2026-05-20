import type { Metadata } from "next";
import Link from "next/link";
import { listMarketHeaders, type MarketHeader } from "@/lib/market-brief";
import { readLatestCachedProse } from "@/lib/market-brief-prose";
import { fmtDate, fmtInt } from "@/lib/format";

// /briefs — index of all 7 market briefs. Lists each market with its
// most-recently-cached headline snippet so visitors can scan the
// landscape without opening every brief. Sorted alphabetically by city
// for predictable navigation.
//
// Dynamic, not static — pulls cache state on every request so freshly
// generated briefs surface immediately. Cheap: one query per market for
// the cached row (or null), bounded at 7 round-trips.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market briefs",
  description:
    "Weekly analyst-style market briefs across the 7 Dwellsy IQ covered markets — share movement, operator landscape, and notable signals.",
};

interface BriefCardData {
  header: MarketHeader;
  headlineRead: string | null;
  generatedAt: Date | null;
}

async function loadIndex(): Promise<BriefCardData[]> {
  const headers = await listMarketHeaders();
  const cards = await Promise.all(
    headers.map(async (header) => {
      const cached = await readLatestCachedProse(header.marketSlug);
      return {
        header,
        headlineRead: cached?.headlineRead ?? null,
        generatedAt: cached?.generatedAt ?? null,
      };
    })
  );
  return cards;
}

export default async function BriefsIndex() {
  const cards = await loadIndex();

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1080px] px-6 py-14 sm:py-20">
        <p className="dq-eyebrow tracking-[0.16em] text-[11px]">
          Dwellsy IQ research
        </p>
        <h1 className="mt-3 text-[36px] font-semibold leading-[1.1] tracking-[-0.014em] text-navy sm:text-[44px]">
          Market briefs
        </h1>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-[1.55] text-foreground/80">
          Analyst-style structural reads across the 7 Dwellsy IQ covered
          markets. Each brief synthesizes the current methodology version
          and data window into a short, scannable narrative — share
          movement, operator landscape, notable signals worth knowing by
          name.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <BriefCard key={card.header.marketSlug} card={card} />
          ))}
        </div>

        <p className="mt-12 text-[12.5px] text-muted-foreground">
          Briefs regenerate when the methodology version or data window
          changes. Cached otherwise.
        </p>
      </div>
    </div>
  );
}

function BriefCard({ card }: { card: BriefCardData }) {
  const { header, headlineRead, generatedAt } = card;

  return (
    <Link
      href={header.briefUrl}
      className="group block rounded-lg border border-grid bg-white p-5 transition-colors hover:border-navy"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-semibold leading-[1.2] text-navy">
          {header.marketName}
        </h2>
        <span className="dq-eyebrow-muted text-[10.5px] tracking-[0.12em]">
          {header.stateName}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-[14px] leading-[1.55] text-foreground/80">
        {headlineRead ??
          `Active cohort of ${fmtInt(header.eligibleCount)} ranked operators · median DOM ${header.medianDomT12.toFixed(1)}d. Brief will generate on first visit.`}
      </p>
      <div className="mt-4 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>
          {generatedAt
            ? `Generated ${fmtDate(generatedAt.toISOString())}`
            : "Not yet generated"}
        </span>
        <span className="font-semibold text-teal transition-transform group-hover:translate-x-0.5">
          Read full brief →
        </span>
      </div>
    </Link>
  );
}
