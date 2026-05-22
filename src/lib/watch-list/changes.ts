// v0.16 — Server-side orchestration for the change-detection
// feedback loop. Glues:
//
//   1. WatchListView ledger reads — find the user's prior viewedAt
//      for this watch list. For /results that's "the most-recent
//      view EXISTING before this current visit"; for /changes that's
//      "the same baseline /results diffed against" (i.e., the
//      second-most-recent view including the row /results just
//      wrote). Both surfaces want to show the SAME diff, so the
//      math has to agree.
//   2. OperatorSnapshot reads — for each matched pmSlug, fetch the
//      latest snapshot + the snapshot closest to (but not after)
//      the prior viewedAt.
//   3. diffSnapshots() — pure function in change-detection.ts.
//   4. WatchListView write — append a fresh row stamped now, AFTER
//      the diff has been computed. /results does this so subsequent
//      visits baseline against this view. /changes does NOT — it's
//      a read-only detail surface.
//
// The diff library stays pure; this module owns all I/O.

import { prisma } from "@/lib/prisma";
import {
  diffSnapshots,
  summariseChanges,
  type ChangeBreakdown,
  type OperatorChange,
} from "./change-detection";
import type { SnapshotRow, StarsPerMetric } from "./snapshot";

export interface WatchListChanges {
  /** Aggregate breakdown for the banner copy. operatorCount === 0
   *  means no banner renders. */
  breakdown: ChangeBreakdown;
  /** Per-operator changes for the /changes detail table. Keyed by
   *  pmSlug. Empty map when there's nothing to surface. */
  changesByOperator: Map<string, OperatorChange[]>;
  /** True when there's no historical baseline to diff against (the
   *  user has never visited this watch list, or has visited exactly
   *  once and we're computing the detail view of that single visit).
   *  Banner is suppressed in this case. */
  firstVisit: boolean;
}

interface BaseArgs {
  userId: string;
  watchListId: string;
  matchedPmSlugs: string[];
}

/**
 * /results entry point. Records this view (so subsequent visits
 * baseline against it), then diffs against what was previously the
 * most-recent view.
 *
 * Side-effect by design: the WatchListView write is what makes the
 * banner "acknowledged by viewing" — once this function returns,
 * reloading /results won't re-show the same banner unless something
 * else has moved.
 */
export async function computeAndRecordChanges(
  args: BaseArgs
): Promise<WatchListChanges> {
  const { userId, watchListId, matchedPmSlugs } = args;

  // Read the most-recent EXISTING view BEFORE we write the current
  // one. This is the baseline we diff against — equivalent to "skip-1
  // after writing", but reading first means the prior-row pointer
  // is unambiguous even if two requests race (the second arrival
  // would still baseline against the same row).
  const priorView = await prisma.watchListView.findFirst({
    where: { userId, watchListId },
    orderBy: { viewedAt: "desc" },
    select: { viewedAt: true },
  });

  // Write the current view AFTER reading the prior one so the
  // baseline doesn't shift mid-computation. Done unconditionally
  // — first visits still get a row so the SECOND visit has a
  // baseline. The cost is one tiny insert per page load.
  await prisma.watchListView.create({
    data: { userId, watchListId },
  });

  return computeDiff({
    matchedPmSlugs,
    priorViewedAt: priorView?.viewedAt ?? null,
  });
}

/**
 * /changes detail entry point. Read-only — does NOT write a
 * WatchListView row, since "acknowledged by viewing" is owned by
 * the /results page that surfaces the banner.
 *
 * Diffs against the SECOND-most-recent view because the most-recent
 * is the row /results just wrote (the implicit "this session" view).
 * The user navigated here from a banner that was computed against
 * "the row before /results wrote" — we want to show the same
 * baseline, so we skip the most-recent and read the next one down.
 *
 * Edge: when the user bookmarks /changes and arrives without a
 * recent /results visit, the most-recent view in the table is from
 * some earlier session, not "this session". Skipping it surfaces
 * changes-since-the-visit-BEFORE-the-most-recent — which is exactly
 * the diff the user would see if they navigated through /results
 * first. Consistent semantics across both entry paths.
 */
export async function computeChangesForDetailView(
  args: BaseArgs
): Promise<WatchListChanges> {
  const { userId, watchListId, matchedPmSlugs } = args;

  // Find the second-most-recent viewedAt. Prisma's skip: 1 honours
  // the orderBy so this is "next row after the most-recent" in
  // viewedAt-DESC order.
  const baselineView = await prisma.watchListView.findFirst({
    where: { userId, watchListId },
    orderBy: { viewedAt: "desc" },
    skip: 1,
    select: { viewedAt: true },
  });

  return computeDiff({
    matchedPmSlugs,
    priorViewedAt: baselineView?.viewedAt ?? null,
  });
}

/** Shared diff computation. Fetches the two-snapshots-per-operator
 *  read pattern, runs the pure diff, and aggregates the breakdown.
 *  Independent of whether the caller is /results (which writes) or
 *  /changes (which doesn't). */
async function computeDiff(args: {
  matchedPmSlugs: string[];
  priorViewedAt: Date | null;
}): Promise<WatchListChanges> {
  const { matchedPmSlugs, priorViewedAt } = args;

  // No baseline → no diff. Could be first visit (zero existing
  // views) or first detail-view-load (only one existing view, the
  // /results write that just happened).
  if (!priorViewedAt) {
    return {
      breakdown: emptyBreakdown(),
      changesByOperator: new Map(),
      firstVisit: true,
    };
  }

  // Empty match set: degenerate watch list with no operators
  // matching its criteria. Nothing to diff.
  if (matchedPmSlugs.length === 0) {
    return {
      breakdown: emptyBreakdown(),
      changesByOperator: new Map(),
      firstVisit: false,
    };
  }

  const [latestSnapshots, priorSnapshots] = await Promise.all([
    fetchLatestSnapshots(matchedPmSlugs),
    fetchSnapshotsAtOrBefore(matchedPmSlugs, priorViewedAt),
  ]);

  const changesByOperator = new Map<string, OperatorChange[]>();
  for (const pmSlug of matchedPmSlugs) {
    const current = latestSnapshots.get(pmSlug);
    const prior = priorSnapshots.get(pmSlug);
    // Skip operators missing either snapshot — they're either net-
    // new (no prior to diff against) or net-departed (no latest, so
    // not in matched set anyway). Either way, no signal to surface.
    if (!current || !prior) continue;
    const changes = diffSnapshots(prior, current);
    if (changes.length > 0) changesByOperator.set(pmSlug, changes);
  }

  return {
    breakdown: summariseChanges(changesByOperator),
    changesByOperator,
    firstVisit: false,
  };
}

/** Fetch the most-recent OperatorSnapshot for each pmSlug. We read
 *  the full history for the requested slugs (small cardinality —
 *  ~700 PMs × monthly snapshots = a few thousand rows worst-case)
 *  and keep the first row per slug via the index's natural sort.
 *  Prisma doesn't expose DISTINCT ON cleanly; this approach is one
 *  round-trip and uses the existing [pmSlug, snapshotDate DESC]
 *  index as a single sort + scan. */
async function fetchLatestSnapshots(
  pmSlugs: string[]
): Promise<Map<string, SnapshotRow>> {
  const rows = await prisma.operatorSnapshot.findMany({
    where: { pmSlug: { in: pmSlugs } },
    orderBy: [{ pmSlug: "asc" }, { snapshotDate: "desc" }],
  });
  const latestBySlug = new Map<string, SnapshotRow>();
  for (const row of rows) {
    if (latestBySlug.has(row.pmSlug)) continue;
    latestBySlug.set(row.pmSlug, hydrateRow(row));
  }
  return latestBySlug;
}

/** Fetch the OperatorSnapshot closest to but not after `ceiling`
 *  for each pmSlug. Same query pattern with a viewedAt ceiling on
 *  snapshotDate. */
async function fetchSnapshotsAtOrBefore(
  pmSlugs: string[],
  ceiling: Date
): Promise<Map<string, SnapshotRow>> {
  const rows = await prisma.operatorSnapshot.findMany({
    where: {
      pmSlug: { in: pmSlugs },
      snapshotDate: { lte: ceiling },
    },
    orderBy: [{ pmSlug: "asc" }, { snapshotDate: "desc" }],
  });
  const priorBySlug = new Map<string, SnapshotRow>();
  for (const row of rows) {
    if (priorBySlug.has(row.pmSlug)) continue;
    priorBySlug.set(row.pmSlug, hydrateRow(row));
  }
  return priorBySlug;
}

interface RawSnapshotRow {
  pmSlug: string;
  snapshotDate: Date;
  methodologyVersion: string;
  starsPerMetric: string;
  starGoldCount: number;
  starSilverCount: number;
  estimatedPortfolioPoint: number | null;
  estimatedPortfolioBand: string | null;
  topMSAs: string;
  topSubmarkets: string;
  concessionRate: number | null;
  isEligibleForRanking: boolean;
}

/** Convert a Prisma OperatorSnapshot row (JSON columns as serialised
 *  strings) into the SnapshotRow shape the pure diff library expects. */
function hydrateRow(row: RawSnapshotRow): SnapshotRow {
  return {
    pmSlug: row.pmSlug,
    snapshotDate: row.snapshotDate,
    methodologyVersion: row.methodologyVersion,
    starsPerMetric: safeParseStars(row.starsPerMetric),
    starGoldCount: row.starGoldCount,
    starSilverCount: row.starSilverCount,
    estimatedPortfolioPoint: row.estimatedPortfolioPoint,
    estimatedPortfolioBand: row.estimatedPortfolioBand,
    topMSAs: safeParseStringArray(row.topMSAs),
    topSubmarkets: safeParseStringArray(row.topSubmarkets),
    concessionRate: row.concessionRate,
    isEligibleForRanking: row.isEligibleForRanking,
  };
}

function safeParseStars(raw: string): StarsPerMetric {
  const empty: StarsPerMetric = {
    leaseUp: null,
    tenancy: null,
    rentPerformance: null,
    marketingDiscipline: null,
    inventoryTransparency: null,
  };
  try {
    const parsed = JSON.parse(raw) as Partial<StarsPerMetric>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

function emptyBreakdown(): ChangeBreakdown {
  return {
    operatorCount: 0,
    totalChanges: 0,
    starChanges: 0,
    portfolioChanges: 0,
    marketEntries: 0,
    marketDrops: 0,
    submarketChanges: 0,
    concessionChanges: 0,
    eligibilityChanges: 0,
  };
}
