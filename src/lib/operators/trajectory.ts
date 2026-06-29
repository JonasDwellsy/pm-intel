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
}

export interface OperatorTrajectory {
  pmSlug: string;
  /** Ascending by date. */
  points: TrajectoryPoint[];
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
    },
  });
  return {
    pmSlug,
    points: rows.map((r) => ({
      date: r.snapshotDate.toISOString().slice(0, 10),
      portfolioPoint: r.estimatedPortfolioPoint,
      portfolioBand: r.estimatedPortfolioBand,
      goldCount: r.starGoldCount,
      silverCount: r.starSilverCount,
      eligible: r.isEligibleForRanking,
    })),
  };
}

// ─── pure shaping (unit-tested) ─────────────────────────────────────

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
