// v0.22 (3b) — size-banded portfolio estimator, extracted so both the
// seed (prisma/seed.ts) and the historical-trajectory backfill compute
// portfolio identically (single source of truth — no methodology drift
// between the live estimate and the reconstructed one).
//
// Pure function of (coverage, quadrant7Cell). Methodology
// v0.7-portfolio-est-v0.1: annualize T12 URUs, then apply a cohort-banded
// median/p25/p75 unit-per-URU multiplier. Verbatim port of the estimator
// that lived inline in prisma/seed.ts.

import type { ScorecardData } from "@/lib/types";

export type PortfolioEstimate = NonNullable<ScorecardData["portfolioEstimate"]>;

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function estimatePortfolioSize(
  coverage: Record<string, unknown>,
  quadrant7Cell: string | null
): PortfolioEstimate {
  const urusT12 = asInt(coverage.urusT12) ?? 0;
  const months = asInt(coverage.monthsOnPlatform) ?? 0;

  if (urusT12 === 0) return { status: "no_listings" };
  if (months < 3) return { status: "insufficient_history" };

  // Annualize partial-year observations. months < 3 is filtered above, so
  // the smallest denominator is 3 (max 4× upweight).
  const annualization = months < 12 ? 12 / months : 1.0;
  const annualizedUrus = urusT12 * annualization;

  let median = 0;
  let p25 = 0;
  let p75 = 0;
  let n = 0;
  let confidence: "Low" | "Medium" | "High" = "Low";
  let cohort = "";

  const cell = quadrant7Cell;

  if (cell === "SFR Independent") {
    if (annualizedUrus < 100) {
      [median, p25, p75, n, confidence] = [9.29, 5.69, 11.38, 12, "Low"];
      cohort = "SFR Independent, URUs <100";
    } else if (annualizedUrus < 300) {
      [median, p25, p75, n, confidence] = [3.88, 2.49, 4.74, 29, "Medium"];
      cohort = "SFR Independent, URUs 100-299";
    } else {
      [median, p25, p75, n, confidence] = [1.88, 1.68, 2.4, 6, "Low"];
      cohort = "SFR Independent, URUs 300+";
    }
  } else if (cell === "SFR Institutional") {
    [median, p25, p75, n, confidence] = [3.46, 2.4, 4.18, 4, "Low"];
    cohort = "SFR Institutional (all)";
  } else if (cell === "Hybrid") {
    [median, p25, p75, n, confidence] = [3.21, 1.35, 5.1, 4, "Low"];
    cohort = "Hybrid (all)";
  } else if (cell === "Small MF/BTR Independent") {
    [median, p25, p75, n, confidence] = [1.13, 1.01, 2.5, 3, "Low"];
    cohort = "Small MF/BTR Independent (all)";
  } else if (
    cell === "Large MF/BTR Independent" ||
    cell === "Large MF/BTR Institutional" ||
    cell === "Institutional MF" ||
    cell === "BTR Institutional"
  ) {
    return {
      status: "insufficient_data",
      message: "Verified self-report required for Large MF/BTR operators",
      methodologyVersion: "v0.7-portfolio-est-v0.1",
    };
  } else {
    [median, p25, p75, n, confidence] = [4.23, 2.53, 8.11, 59, "Medium"];
    cohort = "Overall fallback";
  }

  return {
    status: "estimated",
    point: Math.round(annualizedUrus * median),
    low: Math.round(annualizedUrus * p25),
    high: Math.round(annualizedUrus * p75),
    cohort,
    cohortN: n,
    confidence,
    multiplierMedian: median,
    methodologyVersion: "v0.7-portfolio-est-v0.1",
  };
}
