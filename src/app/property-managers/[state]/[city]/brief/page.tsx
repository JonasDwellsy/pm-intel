import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { slugToStateCode, citySlug } from "@/lib/slugify";
import { buildMarketBriefData } from "@/lib/market-brief";
import {
  generateBriefProse,
  type BriefProse,
} from "@/lib/market-brief-prose";
import { fmtDate, fmtInt } from "@/lib/format";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// /property-managers/[state]/[city]/brief — auto-generated weekly market
// brief. Server-rendered: each request reads the cache (or generates
// fresh prose if the cache is cold for the current methodologyVersion +
// dataAsOf tuple) and renders the result.
//
// Dynamic, not pre-rendered — the page may trigger an Anthropic API call
// on the cache-miss path, and the cache itself is stored in Postgres so
// there's no static-build artifact to bake. Once warm, subsequent
// requests return the cached prose in a single round-trip.

export const dynamic = "force-dynamic";

type RouteParams = { state: string; city: string };

async function resolveMarketSlug(
  state: string,
  city: string
): Promise<string | null> {
  const stateCode = slugToStateCode(state);
  if (!stateCode) return null;
  const candidates = await prisma.market.findMany({
    where: { state: stateCode },
    select: { id: true, city: true },
  });
  const row = candidates.find((m) => citySlug(m.city) === city);
  return row?.id ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const marketSlug = await resolveMarketSlug(state, city);
  if (!marketSlug) return { title: "Market brief not found" };
  const data = await buildMarketBriefData(marketSlug);
  if (!data) return { title: "Market brief not found" };

  // Pull headline from cache if it exists so metadata reflects the live
  // brief; fall back to a generic description if no brief is cached yet
  // (avoids an API call just for metadata).
  const cachedRow = await prisma.marketBrief.findUnique({
    where: {
      marketSlug_methodologyVersion_dataAsOf: {
        marketSlug: data.market.marketSlug,
        methodologyVersion: data.market.methodologyVersion,
        dataAsOf: new Date(data.market.dataAsOf),
      },
    },
    select: { headlineRead: true },
  });

  const title = `${data.market.marketName} Market Brief — Dwellsy IQ`;
  const description =
    cachedRow?.headlineRead ??
    `Analyst-style structural read on ${data.market.marketName} — share movement, operator landscape, notable signals.`;
  return {
    title,
    description,
    alternates: { canonical: data.market.briefUrl },
    openGraph: { title, description, type: "article" },
    robots: { index: true, follow: true },
  };
}

export default async function MarketBriefPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, city } = await params;
  const marketSlug = await resolveMarketSlug(state, city);
  if (!marketSlug) notFound();

  const data = await buildMarketBriefData(marketSlug);
  if (!data) notFound();

  // Cache-or-generate. If generation fails (API key missing, model
  // error, malformed JSON) we surface a graceful unavailable state
  // rather than 500'ing — the brief is supplementary content, not
  // load-bearing for the rest of the app.
  let prose: BriefProse | null = null;
  let generationError: string | null = null;
  try {
    prose = await generateBriefProse(data);
  } catch (err) {
    generationError =
      err instanceof Error ? err.message : "Unable to generate brief.";
    console.error("[brief] generation failed", err);
  }

  return (
    <div className="bg-background">
      <article className="mx-auto max-w-[720px] px-6 py-14 sm:py-20">
        {/* Header block */}
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <Link href="/briefs" className="hover:text-navy">
            Briefs
          </Link>
          <span className="text-muted-2">/</span>
          <span>{data.market.marketName}</span>
        </nav>

        <p className="dq-eyebrow tracking-[0.16em] text-[11px]">
          MARKET BRIEF · {data.market.marketName.toUpperCase()}
        </p>

        {prose ? (
          <>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-[-0.014em] text-navy sm:text-[40px]">
              {prose.headlineRead}
            </h1>
            <p className="mt-4 text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
              Week of {fmtDate(data.market.dataAsOf)} · Methodology{" "}
              {data.market.methodologyVersion}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-[-0.014em] text-navy sm:text-[40px]">
              {data.market.marketName}
            </h1>
            <p className="mt-4 text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
              Week of {fmtDate(data.market.dataAsOf)} · Methodology{" "}
              {data.market.methodologyVersion}
            </p>
            <div className="mt-8 rounded-md border border-destructive/25 bg-destructive/5 p-4 text-[14px] text-destructive">
              Brief temporarily unavailable. {generationError ?? ""} In the
              meantime, explore the{" "}
              <Link
                href={data.market.marketUrl}
                className="font-semibold text-destructive underline"
              >
                interactive market view
              </Link>
              .
            </div>
          </>
        )}

        {/* Quick stats bar — 4 tiles, magazine spec sheet style */}
        <div className="mt-10 grid grid-cols-2 gap-4 border-y border-grid py-5 sm:grid-cols-4">
          <StatTile
            label="Active operators"
            value={data.market.activeOperatorCount ?? "—"}
          />
          <StatTile
            label="Eligible cohort"
            value={fmtInt(data.market.eligibleCount)}
          />
          <StatTile
            label="Median DOM T12"
            value={`${data.market.medianDomT12.toFixed(1)}d`}
          />
          <StatTile
            label="Rent growth T12"
            value={
              data.market.marketRentGrowthT12 != null
                ? `${data.market.marketRentGrowthT12 >= 0 ? "+" : ""}${(data.market.marketRentGrowthT12 * 100).toFixed(2)}%`
                : "—"
            }
            sub={
              data.market.deltaVsNationalPp != null
                ? `${data.market.deltaVsNationalPp >= 0 ? "+" : ""}${data.market.deltaVsNationalPp.toFixed(2)}pp vs national`
                : null
            }
          />
        </div>

        {/* Prose sections */}
        {prose && (
          <div className="mt-10 space-y-10">
            <BriefSection title="Share movement" body={prose.shareMovement} />
            <BriefSection
              title="Operator landscape"
              body={prose.operatorLandscape}
            />
            <BriefSection title="Notable signals" body={prose.notableSignals} />
          </div>
        )}

        {/* Cross-reference block */}
        <div className="mt-14 rounded-lg border border-grid bg-white px-5 py-4">
          <p className="dq-eyebrow-muted text-[11px] tracking-[0.14em]">
            Go deeper
          </p>
          <Link
            href={data.market.marketUrl}
            className="mt-1 inline-flex items-center gap-1.5 text-[16px] font-semibold text-navy transition-colors hover:text-teal"
          >
            Explore {data.market.marketName} in detail
            <span aria-hidden className="text-teal">
              →
            </span>
          </Link>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-grid pt-5 text-[12px] leading-[1.5] text-muted-foreground">
          {prose ? (
            <p>
              Generated {fmtDate(prose.generatedAt.toISOString())} · Powered
              by Dwellsy IQ research methodology · See{" "}
              <Link href="/methodology" className="text-teal hover:underline">
                methodology
              </Link>{" "}
              for definitions of star ratings, share trajectory, and the
              7-cell operator taxonomy.
            </p>
          ) : (
            <p>
              Powered by Dwellsy IQ research methodology · See{" "}
              <Link href="/methodology" className="text-teal hover:underline">
                methodology
              </Link>{" "}
              for definitions.
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string | null;
}) {
  return (
    <div>
      <p className="dq-eyebrow-muted text-[10.5px] tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold leading-[1.1] tracking-[-0.012em] text-navy dq-tnum">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function BriefSection({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
        {title}
      </h2>
      {/* Reuses the .dq-markdown stylesheet defined in globals.css for the
          Ask Dwellsy IQ chat — same link / paragraph / strong treatment.
          Slightly larger base size + line-height for the magazine read. */}
      <div className="dq-markdown mt-3 text-[16.5px] leading-[1.65] text-foreground/85">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </section>
  );
}
