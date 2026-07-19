import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { shouldSkipCriteriaMatch } from "@/lib/watch-list/kind";
import { getEntitledMarketIds } from "@/lib/auth/market-entitlements.server";
import {
  getWatchListWithCrossOrgCheck,
  listMembers,
} from "@/lib/watch-list/store";
import { canEditList } from "@/lib/watch-list/visibility";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { computeAndRecordChanges } from "@/lib/watch-list/changes";
import { ResultsTable } from "@/components/watch-list/ResultsTable";
import { ReRunButton } from "@/components/watch-list/ReRunButton";
import { ShareToggle } from "@/components/watch-list/ShareToggle";
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
  const access = await getWatchListWithCrossOrgCheck({
    watchListId: id,
    userId,
    activeOrganizationId: organizationId,
  });
  if (access.status === "not_found") notFound();
  if (access.status === "wrong_org") {
    redirect(
      `/watch-lists?wrongOrg=${encodeURIComponent(access.ownerOrgName)}`
    );
  }
  const watchList = access.record;

  // v0.22 — scope results to the owning org's entitled markets.
  const entitlement = await getEntitledMarketIds(organizationId);
  // v0.27 (Task 5) — manually-pinned members union into the results
  // below, still bounded by the entitlement filter inside applyWatchList.
  const pins = new Set(
    (await listMembers(watchList.id)).map((m) => m.memberKey)
  );
  // v0.28 (Task 7) — a list with NO criteria (pins-only by convention)
  // must skip the natural criteria-match loop so results consist purely
  // of the pin union (every row correctly flagged pinned) instead of the
  // entire operator universe. Derived from criteria-presence, not the
  // stored `kind` column, so a pins-only list that later gains criteria
  // is picked up automatically. See apply.ts's doc comment on the 4th
  // parameter for the full rationale.
  const skipCriteria = shouldSkipCriteriaMatch(watchList);
  const applied = await applyWatchList(
    {
      id: watchList.id,
      name: watchList.name,
      description: watchList.description,
      requiredCriteria: watchList.requiredCriteria,
      preferredCriteria: watchList.preferredCriteria,
      excludedCriteria: watchList.excludedCriteria,
    },
    entitlement,
    pins,
    skipCriteria
  );
  // Owner-only manage/remove control on a watch list's results (Task 7
  // Step 2) — canEditList covers both "you own it" and "legacy-owned
  // list in your org", same rule every other mutation in this module
  // uses. A view-only shared viewer never sees the remove control.
  const canEdit = canEditList(watchList, { userId, organizationId });

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
  // Task 7 (final review) — the criteria branch below must count only
  // rows that passed the list's CRITERIA, not pin-union additions. A
  // hybrid list's pinned-only rows carry `matched` falsy and a sentinel
  // fitScore of 0, which would otherwise inflate "X of Y match" and
  // drag the fit-score range floor to 0. See results-view.ts.
  const criteriaMatched = summary.criteriaMatchedOperatorCount;
  const criteriaScoreMin = summary.criteriaScoreMinOperator;
  const criteriaScoreMax = summary.criteriaScoreMaxOperator;

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
              {skipCriteria ? (
                // v0.29 (Task 5) — a pins-only roster has no criteria to
                // "match against"; every row is here because a person
                // added it to be watched. "X of Y operators match" would
                // overstate Y (the entire operator universe) as if it
                // were the denominator of a real match rate, and the
                // fit-score range is meaningless when it's uniformly 100
                // for every row. Frame around monitoring instead: how
                // many operators this roster is watching.
                <>
                  <span className="dq-mono text-navy tabular-nums">
                    {headlineMatched}
                  </span>{" "}
                  {headlineMatched === 1 ? "operator" : "operators"} watched
                </>
              ) : (
                <>
                  {/* v0.28 (Task 7, final review) — this count + range
                      reflect CRITERIA-matched operators only. A hybrid
                      list's pinned-only rows are excluded here (they'd
                      inflate the count against headlineTotal and drag
                      the range floor to their sentinel fitScore of 0);
                      they still appear in the table below, badged
                      "Pinned". */}
                  <span className="dq-mono text-navy tabular-nums">
                    {criteriaMatched}
                  </span>{" "}
                  of{" "}
                  <span className="dq-mono text-navy tabular-nums">
                    {headlineTotal}
                  </span>{" "}
                  operators match this watch list
                  {criteriaScoreMin !== null && criteriaScoreMax !== null && (
                    <>
                      {" · fit score range "}
                      <span className="dq-mono text-navy tabular-nums">
                        {criteriaScoreMin}–{criteriaScoreMax}
                      </span>
                    </>
                  )}
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
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <MethodologyDisclosure />
              {/* v0.29 (Task 5) — subtle alerts opt-in. Links to the
                  existing per-user digest preference rather than adding
                  a per-list toggle; the digest already covers every
                  watch list the viewer can see, so this can render on
                  any list regardless of skipCriteria. Copy stays to what
                  the digest actually does (monthly cadence, only on
                  change) — see settings/notifications/page.tsx. */}
              <p className="text-[12px] text-muted-foreground">
                Get a monthly email when these operators move —{" "}
                <Link
                  href="/settings/notifications"
                  className="text-teal hover:text-teal-700 hover:underline"
                >
                  turn on alerts
                </Link>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Fix 1 (final-review) — owner-only share toggle. Same
                canEdit gate as canManageMembers below; a view-only
                shared viewer never sees this control. */}
            {canEdit && (
              <ShareToggle
                watchListId={watchList.id}
                initialIsShared={watchList.isShared}
              />
            )}
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
          <EmptyMatches watchListId={watchList.id} isPinnedList={skipCriteria} />
        ) : (
          <ResultsTable
            operatorRows={operatorRows}
            marketRows={marketRows}
            required={watchList.requiredCriteria}
            preferred={watchList.preferredCriteria}
            excluded={watchList.excludedCriteria}
            watchListId={watchList.id}
            canManageMembers={canEdit}
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

function EmptyMatches({
  watchListId,
  isPinnedList,
}: {
  watchListId: string;
  isPinnedList: boolean;
}) {
  // v0.29 (Task 5) — a pins-only roster with zero pins isn't a criteria
  // problem (it has no criteria); the "required criteria may be too
  // narrow" copy would be actively misleading here.
  if (isPinnedList) {
    return (
      <div className="mt-10 rounded-lg border border-dashed border-grid bg-white p-10 text-center">
        <h2 className="text-[18px] font-semibold text-navy">
          No operators watched yet
        </h2>
        <p className="mt-2 mx-auto max-w-[48ch] text-[13.5px] text-foreground/70">
          Use the &ldquo;Watch list&rdquo; control on any operator scorecard,
          market row, or search result to add an operator here.
        </p>
      </div>
    );
  }
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
