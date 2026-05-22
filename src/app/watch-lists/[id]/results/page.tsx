import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { getWatchList } from "@/lib/watch-list/store";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { computeAndRecordChanges } from "@/lib/watch-list/changes";
import { ResultsTable } from "@/components/watch-list/ResultsTable";
import { ReRunButton } from "@/components/watch-list/ReRunButton";
import { MethodologyDisclosure } from "@/components/watch-list/MethodologyDisclosure";
import { DownloadButton } from "@/components/watch-list/DownloadButton";
import { ChangesBanner } from "@/components/watch-list/ChangesBanner";
import { METHODOLOGY_VERSION } from "@/lib/version";
import { TrackEvent } from "@/components/analytics/TrackEvent";

// /watch-lists/[id]/results — v0.9 default view is operator-level
// rollup (one row per canonical operator with members aggregated).
// The page generates BOTH projections server-side and hands them
// to the client table, which switches via a localStorage-persisted
// "Operator view" / "Market view" toggle.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch List results",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WatchListResultsPage({ params }: PageProps) {
  const { id } = await params;
  // Middleware enforces auth; scope getWatchList by the caller's
  // active org so requesting another org's watch-list id renders
  // the standard 404 (no existence leak).
  const { userId } = await auth();
  if (!userId) notFound();
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    redirect(`/setup-workspace?from=/watch-lists/${id}/results`);
  }
  const watchList = await getWatchList(id, organizationId);
  if (!watchList) notFound();

  const applied = await applyWatchList({
    id: watchList.id,
    name: watchList.name,
    description: watchList.description,
    requiredCriteria: watchList.requiredCriteria,
    preferredCriteria: watchList.preferredCriteria,
    excludedCriteria: watchList.excludedCriteria,
  });

  const { marketRows, operatorRows, summary } = projectResultsForView({
    marketResults: applied.results,
    operatorResults: applied.operatorResults,
    watchListId: watchList.id,
    totalCandidates: applied.totalCandidates,
    totalOperators: applied.totalOperators,
    matchedCount: applied.matchedCount,
    matchedOperatorCount: applied.matchedOperatorCount,
    generatedAt: applied.generatedAt,
  });

  // v0.16 — Change-detection diff against the user's prior viewedAt
  // for this watch list. Computes BEFORE writing the new view row
  // so this load reflects the delta since the previous visit, not
  // since this one. Empty matched-set → no diff, no banner. First
  // visit → no banner (no baseline). Errors here must not break the
  // results render; we catch and proceed with no banner.
  const matchedPmSlugs = applied.results.map((r) => r.pmSlug);
  let changes: Awaited<ReturnType<typeof computeAndRecordChanges>> | null = null;
  try {
    changes = await computeAndRecordChanges({
      userId,
      watchListId: watchList.id,
      matchedPmSlugs,
    });
  } catch (err) {
    // Defensive — change-detection is observational. Failure here
    // (snapshot table missing in a dev environment, DB hiccup, etc.)
    // must not 500 the results page.
    console.error("[watch-list/changes] compute failed:", err);
  }

  // Headline counts/score range default to the operator-view numbers
  // since that's the view we show first; the table switches to
  // market numbers when the user toggles.
  const headlineMatched = summary.matchedOperatorCount;
  const headlineTotal = summary.totalOperators;
  const scoreMin = summary.scoreMinOperator;
  const scoreMax = summary.scoreMaxOperator;

  return (
    <div className="bg-background">
      {/* v0.17 — watch_list_viewed. operator_count uses the operator-
          rollup count (the headline number the user reads) rather
          than the market-row count. */}
      <TrackEvent
        event="watch_list_viewed"
        properties={{
          watch_list_id: watchList.id,
          operator_count: headlineMatched,
        }}
      />
      <div className="mx-auto max-w-[1280px] px-6 py-10">
        <Link
          href="/watch-lists"
          className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
        >
          ← All watch lists
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              Watch List Results
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[34px]">
              {watchList.name}
            </h1>
            <p className="mt-3 text-[14.5px] text-foreground/80">
              <span className="dq-mono text-navy tabular-nums">
                {headlineMatched}
              </span>{" "}
              of{" "}
              <span className="dq-mono text-navy tabular-nums">
                {headlineTotal}
              </span>{" "}
              operators match this watch list
              {scoreMin !== null && scoreMax !== null && (
                <>
                  {" · fit score range "}
                  <span className="dq-mono text-navy tabular-nums">
                    {scoreMin}–{scoreMax}
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              <span className="dq-mono tabular-nums">
                {summary.matchedCount}
              </span>{" "}
              market-level rows when broken out by PM-market pair (toggle
              below).
            </p>
            {watchList.description && (
              <p className="mt-2 max-w-[80ch] text-[13.5px] text-foreground/70">
                {watchList.description}
              </p>
            )}
            <div className="mt-3">
              <MethodologyDisclosure />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/watch-lists/${watchList.id}/edit`}
              className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-3.5 text-[13px] font-medium text-navy hover:bg-surface-soft"
            >
              Edit Watch List
            </Link>
            <ReRunButton />
            <DownloadButton
              watchList={{
                id: watchList.id,
                name: watchList.name,
                description: watchList.description ?? null,
                requiredCriteria: watchList.requiredCriteria,
                preferredCriteria: watchList.preferredCriteria,
                excludedCriteria: watchList.excludedCriteria,
              }}
              operatorRows={operatorRows}
              marketRows={marketRows}
              totalCandidates={summary.totalCandidates}
              methodologyVersion={METHODOLOGY_VERSION}
              liveUrl={buildLiveUrl(watchList.id)}
            />
          </div>
        </header>

        {changes && !changes.firstVisit && (
          <div className="mt-6">
            <ChangesBanner
              watchListId={watchList.id}
              breakdown={changes.breakdown}
            />
          </div>
        )}

        {headlineMatched === 0 && summary.matchedCount === 0 ? (
          <EmptyMatches watchListId={watchList.id} />
        ) : (
          <ResultsTable
            operatorRows={operatorRows}
            marketRows={marketRows}
            required={watchList.requiredCriteria}
            preferred={watchList.preferredCriteria}
            excluded={watchList.excludedCriteria}
          />
        )}

        <p className="mt-8 text-[11.5px] text-muted-foreground dq-mono">
          Generated {new Date(summary.generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/** Build the canonical results URL for the Summary sheet's
 *  "Live results page" link. Server side, NEXT_PUBLIC_SITE_URL
 *  is the deployment host (e.g. https://pm-intel-chi.vercel.app);
 *  local dev falls back to localhost so the link still resolves
 *  when an export is generated against a dev server. */
function buildLiveUrl(watchListId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/watch-lists/${watchListId}/results`;
}

function EmptyMatches({ watchListId }: { watchListId: string }) {
  return (
    <div className="mt-10 rounded-lg border border-dashed border-grid bg-white p-10 text-center">
      <h2 className="text-[18px] font-semibold text-navy">
        No operators match this watch list
      </h2>
      <p className="mt-2 mx-auto max-w-[48ch] text-[13.5px] text-foreground/70">
        Your required criteria may be too narrow, or an excluded rule may be
        vetoing the entire universe. Loosen a required criterion or remove an
        excluded rule to see results.
      </p>
      <Link
        href={`/watch-lists/${watchListId}/edit`}
        className="mt-5 inline-flex h-9 items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
      >
        Edit Watch List
      </Link>
    </div>
  );
}
