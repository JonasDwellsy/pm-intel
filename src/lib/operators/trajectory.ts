// v0.22 (3a) — operator trajectory over time.
//
// Reads the OperatorSnapshot time-series for a single per-market operator
// (keyed by pmSlug) and shapes it for the scorecard trajectory section.
// The loader is server-side (prisma); the shaping helpers below are pure
// and unit-tested. 3b (the quarterly historical backfill) writes more
// rows into the same table, so this surface deepens automatically with no
// code change.

import { prisma } from "@/lib/prisma";

export interface TrajectoryPoint {
  /** snapshotDate as yyyy-mm-dd. */
  date: string;
  /** Estimated portfolio units; null when that snapshot couldn't estimate. */
  portfolioPoint: number | null;
  /** Confidence tier ('Low'|'Medium'|'High') or a status string. */
  portfolioBand: string | null;
  goldCount: number;
  silverCount: number;
  eligible: boolean;
  /** Distinct submarkets with T12 listings that snapshot — geographic-reach
   *  proxy. Optional: only the per-operator loader populates it. */
  submarketCount?: number | null;
  /** Fraction (0..1) of T12 listings mentioning concessions that snapshot. */
  concessionRate?: number | null;
  /** Operator's T12 listing count that snapshot (numerator of share).
   *  null on recon rows written before the v0.25 backfill re-run. */
  t12ListingsCount?: number | null;
  /** Operator's share (0..1) of its market's total T12 listings that
   *  snapshot: t12ListingsCount ÷ market total that date. null when either
   *  the operator's count or the market total is unavailable. Populated only
   *  by the single-operator loader (needs the market-wide sum). Drives the
   *  Momentum "Listing share" sparkline. */
  shareOfMarket?: number | null;
}

export interface OperatorTrajectory {
  pmSlug: string;
  /** Ascending by date. */
  points: TrajectoryPoint[];
}

/** Count of distinct submarkets in the stored `topSubmarkets` JSON array
 *  (geographic-reach proxy). null when absent or unparseable. */
export function parseSubmarketCount(topSubmarkets: string | null): number | null {
  if (!topSubmarkets) return null;
  try {
    const arr = JSON.parse(topSubmarkets);
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}

/** Attach each point's share of its market's total T12 listings that
 *  snapshot date. share = point.t12ListingsCount ÷ marketTotalByDate[date];
 *  null when the operator's count is missing, or the market total for that
 *  date is missing / zero. Pure + unit-tested. */
export function attachShareOfMarket(
  points: TrajectoryPoint[],
  marketTotalByDate: Map<string, number>
): TrajectoryPoint[] {
  return points.map((p) => {
    const total = marketTotalByDate.get(p.date);
    const share =
      p.t12ListingsCount != null && total != null && total > 0
        ? p.t12ListingsCount / total
        : null;
    return { ...p, shareOfMarket: share };
  });
}

/** Sum every operator's t12ListingsCount per snapshot date across the focal
 *  operator's whole market — the denominator for share-of-market. Keyed by
 *  yyyy-mm-dd. Empty when the operator's PM row or market can't be resolved
 *  (share then degrades to null, hiding the sparkline). */
async function loadMarketT12TotalsByDate(
  pmSlug: string
): Promise<Map<string, number>> {
  const pm = await prisma.pM.findUnique({
    where: { slug: pmSlug },
    select: { marketId: true },
  });
  if (!pm) return new Map();
  const marketSlugs = (
    await prisma.pM.findMany({
      where: { marketId: pm.marketId },
      select: { slug: true },
    })
  ).map((p) => p.slug);
  const grouped = await prisma.operatorSnapshot.groupBy({
    by: ["snapshotDate"],
    where: { pmSlug: { in: marketSlugs }, t12ListingsCount: { not: null } },
    _sum: { t12ListingsCount: true },
  });
  const totals = new Map<string, number>();
  for (const g of grouped) {
    totals.set(
      g.snapshotDate.toISOString().slice(0, 10),
      g._sum.t12ListingsCount ?? 0
    );
  }
  return totals;
}

export async function loadOperatorTrajectory(
  pmSlug: string
): Promise<OperatorTrajectory> {
  const rows = await prisma.operatorSnapshot.findMany({
    where: { pmSlug },
    orderBy: { snapshotDate: "asc" },
    select: {
      snapshotDate: true,
      estimatedPortfolioPoint: true,
      estimatedPortfolioBand: true,
      starGoldCount: true,
      starSilverCount: true,
      isEligibleForRanking: true,
      topSubmarkets: true,
      concessionRate: true,
      t12ListingsCount: true,
    },
  });
  const points: TrajectoryPoint[] = rows.map((r) => ({
    date: r.snapshotDate.toISOString().slice(0, 10),
    portfolioPoint: r.estimatedPortfolioPoint,
    portfolioBand: r.estimatedPortfolioBand,
    goldCount: r.starGoldCount,
    silverCount: r.starSilverCount,
    eligible: r.isEligibleForRanking,
    submarketCount: parseSubmarketCount(r.topSubmarkets),
    concessionRate: r.concessionRate,
    t12ListingsCount: r.t12ListingsCount,
  }));
  const marketTotalByDate = await loadMarketT12TotalsByDate(pmSlug);
  return { pmSlug, points: attachShareOfMarket(points, marketTotalByDate) };
}

// ─── pure shaping (unit-tested) ─────────────────────────────────────

/**
 * A snapshot's estimator "generation": its methodologyVersion with any "-recon"
 * backfill suffix stripped. Reconstructed history (backfill-trajectory.ts tags
 * rows "<methodology>-recon", e.g. "v0.7-recon") is the SAME generation as the
 * live captures it deepens ("v0.7"), so the two must group together.
 */
export function snapshotGeneration(methodologyVersion: string): string {
  return methodologyVersion.replace(/-recon$/, "");
}

/**
 * The methodologyVersion values belonging to the current estimator generation
 * — the live tag + its "-recon" backfill sibling — given the most-recent
 * snapshot's version. Digest queries filter `methodologyVersion IN (...)` on
 * this so they never diff across generations (which would report a methodology
 * recalibration as spurious rating/portfolio changes). Null → no snapshots.
 */
export function currentGenerationVersions(
  latestMethodologyVersion: string | null | undefined
): string[] | null {
  if (!latestMethodologyVersion) return null;
  const gen = snapshotGeneration(latestMethodologyVersion);
  return [gen, `${gen}-recon`];
}

/**
 * Keep only snapshots from the CURRENT methodology generation — defined as the
 * generation of the most-recent snapshot. Older generations (a prior portfolio
 * estimator, or pre-retag backfill rows) are dropped, because the portfolio
 * estimate scale (and star scoring) changed across methodology revisions:
 * blending them onto one axis renders a methodology recalibration as a fake
 * portfolio cliff (e.g. 1,412 → 446). Live captures and their matching "-recon"
 * backfill are the same generation and stay together. Self-adapting: after a
 * future methodology bump, history collapses to the new generation until the
 * trajectory backfill is re-run and re-tagged. Order-independent; empty or
 * single-generation input returns unchanged.
 */
export function keepCurrentGenerationSnapshots<
  T extends { snapshotDate: Date; methodologyVersion: string }
>(rows: T[]): T[] {
  if (rows.length === 0) return rows;
  let latest = rows[0];
  for (const r of rows) {
    if (r.snapshotDate.getTime() > latest.snapshotDate.getTime()) latest = r;
  }
  const current = snapshotGeneration(latest.methodologyVersion);
  return rows.filter((r) => snapshotGeneration(r.methodologyVersion) === current);
}

/**
 * Clamp any aggregate point whose (quarter-end) date sits beyond the latest
 * real snapshot back to that date. The quarterly collapse stamps points to
 * their quarter-END for member alignment, which for the in-progress quarter
 * projects into the future (a mid-July snapshot → Sep 30); this pulls only
 * those future-stamped points back to real data. Only the final point can be
 * affected (no date collisions). `maxDate` empty → no-op.
 */
export function clampFutureTrajectoryDates(
  points: AggregateTrajectoryPoint[],
  maxDate: string
): AggregateTrajectoryPoint[] {
  if (!maxDate) return points;
  return points.map((p) => (p.date > maxDate ? { ...p, date: maxDate } : p));
}


export interface TrajectorySummary {
  pointCount: number;
  firstDate: string | null;
  lastDate: string | null;
  firstPortfolio: number | null;
  lastPortfolio: number | null;
  /** lastPortfolio - firstPortfolio, when both ends have a value. */
  netPortfolioDelta: number | null;
  /** True when there are ≥2 snapshots WITH a portfolio value — enough to
   *  draw a line. Below that the UI shows the thin-history state. */
  hasTrend: boolean;
}

export function summarizeTrajectory(t: OperatorTrajectory): TrajectorySummary {
  const pts = t.points;
  const withPortfolio = pts.filter(
    (p): p is TrajectoryPoint & { portfolioPoint: number } =>
      typeof p.portfolioPoint === "number"
  );
  const firstP = withPortfolio[0] ?? null;
  const lastP = withPortfolio[withPortfolio.length - 1] ?? null;
  const netPortfolioDelta =
    firstP && lastP && firstP !== lastP
      ? lastP.portfolioPoint - firstP.portfolioPoint
      : null;
  return {
    pointCount: pts.length,
    firstDate: pts[0]?.date ?? null,
    lastDate: pts[pts.length - 1]?.date ?? null,
    firstPortfolio: firstP?.portfolioPoint ?? null,
    lastPortfolio: lastP?.portfolioPoint ?? null,
    netPortfolioDelta,
    hasTrend: withPortfolio.length >= 2,
  };
}

// ─── operator-level (cross-market) aggregate ───────────────────────

/** One quarter of an operator's aggregate trajectory: its members'
 *  values rolled up. Extends TrajectoryPoint (so summarizeTrajectory /
 *  buildSparkline work directly) with the footprint count. portfolioPoint
 *  here is the SUM of members' point estimates that quarter. */
export interface AggregateTrajectoryPoint extends TrajectoryPoint {
  /** Distinct member markets with a snapshot that quarter (footprint). */
  marketsPresent: number;
}

export interface OperatorAggregateTrajectory {
  points: AggregateTrajectoryPoint[];
}

/** Minimal snapshot row the aggregator needs, pre-normalized (date as
 *  yyyy-mm-dd). Pure + unit-tested. */
export interface MemberSnapshotRow {
  date: string;
  pmSlug: string;
  portfolioPoint: number | null;
  goldCount: number;
  silverCount: number;
}

/** The quarter-end date (yyyy-mm-dd) containing `date`. */
export function quarterEndDate(date: string): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  const q = Math.ceil(m / 3); // 1..4
  const [em, ed] = [
    [3, 31],
    [6, 30],
    [9, 30],
    [12, 31],
  ][q - 1];
  return `${y}-${String(em).padStart(2, "0")}-${ed}`;
}

/** Collapse rows to one per (member, quarter), keeping the LATEST
 *  snapshot in each quarter and stamping it with the quarter-end date.
 *  This removes the intra-quarter ramp artifact from forward snapshots
 *  captured while markets were still being onboarded — the aggregate then
 *  reads as a clean quarterly series. Reconstructed rows are already
 *  quarter-ends, so they pass through unchanged. Pure + unit-tested. */
export function collapseMemberRowsToQuarterly(
  rows: MemberSnapshotRow[]
): MemberSnapshotRow[] {
  const best = new Map<string, { origDate: string; row: MemberSnapshotRow }>();
  for (const r of rows) {
    const qe = quarterEndDate(r.date);
    const key = `${r.pmSlug}|${qe}`;
    const cur = best.get(key);
    if (!cur || r.date > cur.origDate) {
      best.set(key, { origDate: r.date, row: { ...r, date: qe } });
    }
  }
  return [...best.values()].map((v) => v.row);
}

/** Roll member snapshots up to a per-quarter aggregate: sum portfolio
 *  across members that have an estimate (null only when NONE do), count
 *  distinct member markets present, sum stars. Ascending by date. */
export function aggregateMemberSnapshots(
  rows: MemberSnapshotRow[]
): AggregateTrajectoryPoint[] {
  const byDate = new Map<
    string,
    { members: Set<string>; portfolios: number[]; gold: number; silver: number }
  >();
  for (const r of rows) {
    const g =
      byDate.get(r.date) ??
      { members: new Set<string>(), portfolios: [], gold: 0, silver: 0 };
    g.members.add(r.pmSlug);
    if (typeof r.portfolioPoint === "number") g.portfolios.push(r.portfolioPoint);
    g.gold += r.goldCount;
    g.silver += r.silverCount;
    byDate.set(r.date, g);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, g]) => ({
      date,
      portfolioPoint:
        g.portfolios.length > 0
          ? g.portfolios.reduce((s, v) => s + v, 0)
          : null,
      portfolioBand: null,
      goldCount: g.gold,
      silverCount: g.silver,
      eligible: true,
      marketsPresent: g.members.size,
    }));
}

/** Load the cross-market aggregate trajectory for an operator from its
 *  member pmSlugs (which the caller has already scoped to the viewer's
 *  entitled markets, so entitlement is respected for free). */
export async function loadOperatorAggregateTrajectory(
  memberPmSlugs: string[]
): Promise<OperatorAggregateTrajectory> {
  if (memberPmSlugs.length === 0) return { points: [] };
  const rows = await prisma.operatorSnapshot.findMany({
    where: { pmSlug: { in: memberPmSlugs } },
    orderBy: { snapshotDate: "asc" },
    select: {
      snapshotDate: true,
      methodologyVersion: true,
      pmSlug: true,
      estimatedPortfolioPoint: true,
      starGoldCount: true,
      starSilverCount: true,
    },
  });
  // Drop older methodology generations first — a prior portfolio estimator
  // produced a different scale, so blending it in renders a methodology change
  // as a fake portfolio cliff (see keepCurrentGenerationSnapshots).
  const kept = keepCurrentGenerationSnapshots(rows);
  const mapped: MemberSnapshotRow[] = kept.map((r) => ({
    date: r.snapshotDate.toISOString().slice(0, 10),
    pmSlug: r.pmSlug,
    portfolioPoint: r.estimatedPortfolioPoint,
    goldCount: r.starGoldCount,
    silverCount: r.starSilverCount,
  }));
  // The latest real snapshot date — the quarterly collapse stamps points to
  // their quarter-END, which for the in-progress quarter would sit in the
  // future (e.g. a July snapshot → Sep 30); clamp those back to real data.
  const maxDate = mapped.reduce((m, r) => (r.date > m ? r.date : m), "");
  // Collapse to one point per (member, quarter) so incrementally-onboarded
  // forward snapshots don't create an intra-quarter footprint ramp.
  const points = clampFutureTrajectoryDates(
    aggregateMemberSnapshots(collapseMemberRowsToQuarterly(mapped)),
    maxDate
  );
  return { points };
}

export interface SparkPoint {
  x: number;
  y: number;
  value: number;
  date: string;
}

/** Map the portfolio series to SVG coordinates inside a width×height box
 *  (with `pad` inset). x spreads evenly across the points that HAVE a
 *  portfolio value (preserving date order); y is inverted (SVG origin is
 *  top-left) and scaled to the series min/max. Returns [] when fewer than
 *  2 points carry a value — the caller renders the thin-history state.
 *  A flat series (min === max) pins to the vertical middle. */
export function buildSparkline(
  points: TrajectoryPoint[],
  width: number,
  height: number,
  pad = 4
): SparkPoint[] {
  const vals = points.filter(
    (p): p is TrajectoryPoint & { portfolioPoint: number } =>
      typeof p.portfolioPoint === "number"
  );
  if (vals.length < 2) return [];
  const min = Math.min(...vals.map((p) => p.portfolioPoint));
  const max = Math.max(...vals.map((p) => p.portfolioPoint));
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return vals.map((p, i) => {
    const x = pad + (vals.length === 1 ? innerW / 2 : (innerW * i) / (vals.length - 1));
    const y =
      span === 0
        ? pad + innerH / 2
        : pad + innerH - (innerH * (p.portfolioPoint - min)) / span;
    return { x, y, value: p.portfolioPoint, date: p.date };
  });
}
