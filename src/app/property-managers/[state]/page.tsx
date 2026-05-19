import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateHero } from "@/components/state/StateHero";
import { MarketCard } from "@/components/state/MarketCard";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { fmtDate } from "@/lib/format";
import { listStateRouteParams, loadStateView } from "@/lib/state-data";

// v0.6.3 Patch 5 — state landing pages
// (Methodology_v0.6.3_Patches.md §Patch 5). Resolves at
// /property-managers/[state]; sits between the property-managers index
// and the existing /property-managers/[state]/[city] market route. Both
// state-only and state/city routes coexist cleanly because Next routes
// the longer path to the more-specific file (already two folder levels
// deeper in the app dir).

type RouteParams = { state: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listStateRouteParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state } = await params;
  const view = await loadStateView(state);
  if (!view) return { title: "State not found" };
  const title = `Property Managers in ${view.stateName}`;
  const description = `${view.aggregates.stateEligibleOperatorCount} ranked operators across ${view.markets.length} MSA${view.markets.length === 1 ? "" : "s"} in ${view.stateName}. Click through to ${view.markets.map((m) => m.city).join(", ")}.`;
  return {
    title,
    description,
    alternates: { canonical: `/property-managers/${state}` },
    openGraph: { title, description, type: "website" },
  };
}

function Breadcrumb({ stateName }: { stateName: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto flex max-w-[1320px] items-center gap-2 px-6 py-3.5 text-[12.5px] text-muted-foreground sm:px-14"
    >
      <Link href="/" className="hover:text-navy">
        Home
      </Link>
      <span className="text-muted-2">›</span>
      <Link href="/property-managers" className="hover:text-navy">
        Property managers
      </Link>
      <span className="text-muted-2">›</span>
      <span className="font-medium text-navy">{stateName}</span>
    </nav>
  );
}

function MethodologyFooter({
  version,
  dataAsOf,
}: {
  version: string;
  dataAsOf: string;
}) {
  return (
    <div className="border-t border-grid bg-white">
      <p className="mx-auto max-w-[1320px] px-6 py-6 text-[12.5px] leading-[1.65] text-muted-foreground sm:px-14">
        State-level aggregates pool ranked operators across all MSAs in{" "}
        the state and compute medians across the pooled set. Multi-market
        operators may be counted once per MSA. Methodology{" "}
        <span className="dq-mono font-medium text-navy/85">
          v{version.replace(/^v/, "")}
        </span>{" "}
        · Data as of{" "}
        <span className="dq-mono font-medium text-navy/85">
          {fmtDate(dataAsOf)}
        </span>{" "}
        ·{" "}
        <Link
          href="/methodology#state-aggregates"
          className="font-medium text-teal hover:text-teal-700"
        >
          Learn more →
        </Link>
      </p>
    </div>
  );
}

export default async function StateLandingPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state } = await params;
  const view = await loadStateView(state);
  if (!view) notFound();

  return (
    <>
      <TrackEvent
        event="market_page_view"
        properties={{
          state: view.stateCode,
          page: "state_landing",
        }}
      />
      <div className="border-b border-grid bg-white">
        <Breadcrumb stateName={view.stateName} />
      </div>

      {/* Hero band */}
      <section className="border-b border-grid bg-white">
        <div className="mx-auto max-w-[1320px] px-6 pb-16 pt-14 sm:px-14">
          <StateHero view={view} />
        </div>
      </section>

      {/* MSA grid band — warm offwhite to set the grid off from the hero */}
      <section className="border-b border-grid bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-14">
          <header className="mb-7">
            <h2 className="dq-h2">
              Markets in {view.stateName}
            </h2>
            <div className="dq-section-rule" />
            <p className="mt-4 max-w-[640px] text-[15px] leading-[1.55] text-muted-foreground">
              {view.markets.length === 1
                ? `One MSA currently in coverage. Click through for the full ranked operator list and per-operator scorecards.`
                : `${view.markets.length} MSAs currently in coverage. Click any market for the full ranked operator list and per-operator scorecards.`}
            </p>
          </header>
          {/* 1 col mobile / 2 on md / 3 on lg+. A 5-MSA state (TN) lays out
              3+2 on lg; single-MSA states (FL, AZ) get a single card sitting
              at the start of the grid. */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {view.markets.map((m) => (
              <MarketCard
                key={m.marketId}
                market={m}
                stateSlug={view.stateSlug}
                stateName={view.stateName}
              />
            ))}
          </div>
        </div>
      </section>

      <MethodologyFooter
        version={view.methodologyVersion}
        dataAsOf={view.dataAsOf}
      />
    </>
  );
}
