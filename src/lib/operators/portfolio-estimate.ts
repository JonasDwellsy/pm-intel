// Portfolio-size estimator — single source, computed at SEED time (prisma/
// seed.ts) and by the trajectory backfill so every reader (scorecard, market
// pages, operator page, watch-lists, AI Ask, briefs, PDF, home, sparkline)
// sees one consistent value via scorecard.portfolioEstimate / the snapshot
// point.
//
// Methodology v0.8: estimate = houseUrusT12 × k_house + aptUrusT12 × k_apt
// (see src/lib/operator-size.ts). Each unit is weighted by its own observed
// type's turnover; uniform across every operator, no cohort banding. The
// multipliers are admin-tunable (AppSetting) and read at seed/backfill time —
// so a change takes effect on the next deploy (re-seed), not live.

import type { ScorecardData } from "@/lib/types";
import {
  estimatedManagedUnits,
  DEFAULT_MULTIPLIERS,
  type PortfolioMultipliers,
} from "@/lib/operator-size";

export type PortfolioEstimate = NonNullable<ScorecardData["portfolioEstimate"]>;

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function estimatePortfolioSize(
  coverage: Record<string, unknown>,
  performance: Record<string, unknown>,
  multipliers: PortfolioMultipliers = DEFAULT_MULTIPLIERS
): PortfolioEstimate {
  const urusT12 = asInt(coverage.urusT12) ?? 0;
  const months = asInt(coverage.monthsOnPlatform) ?? 0;

  if (urusT12 === 0) return { status: "no_listings" };
  if (months < 3) return { status: "insufficient_history" };

  const point = estimatedManagedUnits(
    {
      houseUrusT12: asInt(performance.houseUrusT12),
      aptUrusT12: asInt(performance.aptUrusT12),
    },
    multipliers
  );

  if (point == null || point <= 0) {
    return {
      status: "insufficient_data",
      message: "No observed units to estimate portfolio size.",
      methodologyVersion: "v0.8-house-apt-turnover",
    };
  }

  return {
    status: "estimated",
    point,
    cohort: "house/apt turnover",
    methodologyVersion: "v0.8-house-apt-turnover",
  };
}
