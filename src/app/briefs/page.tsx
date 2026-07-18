import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listMarketHeaders, type MarketHeader } from "@/lib/market-brief";
import { readLatestCachedProse } from "@/lib/market-brief-prose";
import { readCachedNationalHeadline } from "@/lib/national-brief-prose";
import { fmtDate, fmtInt } from "@/lib/format";

// /briefs — index of all market briefs. Lists each market with its
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
    "Monthly analyst-style market briefs across Operator IQ's covered markets — share movement, operator landscape, and notable signals.",
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
  const nationalHeadline = await readCachedNationalHeadline();
  // Teaser gate: anonymous visitors see the full catalog + can read the
  // national brief (the free sample), but opening any market brief requires
  // sign-in. Signed-in users get direct links.
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1080px] px-6 py-14 sm:py-20">
        <p className="dq-eyebrow tracking-[0.16em] text-[11px]">
          Operator IQ research
        </p>
        <h1 className="mt-3 text-[36px] font-semibold leading-[1.1] tracking-[-0.014em] text-navy sm:text-[44px]">
          Market briefs
        </h1>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-[1.55] text-foreground/80">
          Analyst-style structural reads across Operator IQ&apos;s{" "}
          {cards.length} covered markets. Each brief synthesizes the current
          methodology version and data window into a short, scannable
          narrative — share movement, operator landscape, notable signals
          worth knowing by name.
        </p>

        {/* Featured national brief */}
        <Link
          href="/briefs/national"
          className="group mt-10 block rounded-lg border border-navy/30 bg-navy/[0.03] p-6 transition-colors hover:border-navy"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[20px] font-semibold leading-[1.2] text-navy">
              National brief
            </h2>
            <span className="dq-eyebrow-muted text-[10.5px] tracking-[0.12em]">
              ALL {cards.length} MARKETS
            </span>
          </div>
          <p className="mt-3 line-clamp-3 text-[14.5px] leading-[1.55] text-foreground/80">
            {nationalHeadline ??
              "A cross-market state of the union — what moved this period, standout markets, and the national operator landscape. Generates on first visit."}
          </p>
          <span className="mt-4 inline-block text-[12px] font-semibold text-teal transition-transform group-hover:translate-x-0.5">
            Read the national brief →
          </span>
        </Link>

        {!isSignedIn && (
          <p className="mt-6 text-[13px] text-muted-foreground">
            The national brief is free to read. Sign in to open any of the{" "}
            {cards.length} per-market briefs below.
          </p>
        )}

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <BriefCard
              key={card.header.marketSlug}
              card={card}
              isSignedIn={isSignedIn}
            />
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

function BriefCard({
  card,
  isSignedIn,
}: {
  card: BriefCardData;
  isSignedIn: boolean;
}) {
  const { header, headlineRead, generatedAt } = card;
  // Anonymous → route through /sign-in, preserving the brief as redirect_url
  // so the reader lands on the brief right after authenticating.
  const href = isSignedIn
    ? header.briefUrl
    : `/sign-in?redirect_url=${encodeURIComponent(header.briefUrl)}`;

  return (
    <Link
      href={href}
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
          {isSignedIn ? "Read full brief →" : "Sign in to read →"}
        </span>
      </div>
    </Link>
  );
}
