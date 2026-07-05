// Derivation for the re-enriched Operating Performance cards (vacancy, rent
// stability, concessions). Produces the plain-English interpretation, a
// good/watch/neutral tone, and a short "what this measures" definition so the
// cards reach parity with the scored metric cards. Pure + unit-tested.
//
// Copy is kept factual (facts-not-judgments): the interpretation states the
// value vs the peer median; the definition names the metric + its direction;
// the tone chip carries the good/bad read.

export type MetricTone = "good" | "watch" | "neutral";

export interface OperatingDetail {
  interpretation: string;
  tone: MetricTone;
  definition: string;
}

/** 1-decimal, trailing ".0" trimmed: 8.2 → "8.2", 9.0 → "9". */
function f(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// A ±TOL band around the median reads as "in line" (neutral) rather than
// flipping tone on a trivial difference.
const TOL = 0.1;

/**
 * Tone from a value vs its peer median.
 *  - "lowerBetter" (vacancy, rent-stability volatility): below band → good,
 *    above band → watch.
 *  - "higherWorse" (concessions): above band → watch; below/în-line → neutral
 *    (low concession use isn't a distinction worth a "good" chip).
 */
export function metricTone(
  value: number,
  median: number | null,
  direction: "lowerBetter" | "higherWorse"
): MetricTone {
  if (median == null || median <= 0) return "neutral";
  const lo = median * (1 - TOL);
  const hi = median * (1 + TOL);
  if (direction === "lowerBetter") {
    if (value < lo) return "good";
    if (value > hi) return "watch";
    return "neutral";
  }
  // higherWorse
  if (value > hi) return "watch";
  return "neutral";
}

export function vacancyDetail(pct: number, cohortMedianPct: number | null): OperatingDetail {
  const definition =
    "Share of the average leasing cycle a unit sits vacant (from DOM + tenancy). Lower is more favorable.";
  const interpretation =
    cohortMedianPct != null
      ? `Units sit vacant an estimated ${f(pct)}% of the leasing cycle, versus the ${f(cohortMedianPct)}% cohort median.`
      : `Units sit vacant an estimated ${f(pct)}% of the leasing cycle.`;
  return { interpretation, tone: metricTone(pct, cohortMedianPct, "lowerBetter"), definition };
}

export function rentStabilityDetail(
  volatilityPP: number | null,
  cohortMedianPP: number | null
): OperatingDetail {
  const definition =
    "Year-over-year volatility of mix-adjusted rents, in percentage points. Lower means steadier pricing.";
  // Suppressed / no computable volatility → the card renders its caveat, not
  // the interpretation line.
  if (volatilityPP == null) return { interpretation: "", tone: "neutral", definition };
  const interpretation =
    cohortMedianPP != null
      ? `Year-over-year rents vary by ${f(volatilityPP)} pp, versus the ${f(cohortMedianPP)} pp cohort median.`
      : `Year-over-year rents vary by ${f(volatilityPP)} pp.`;
  return {
    interpretation,
    tone: metricTone(volatilityPP, cohortMedianPP, "lowerBetter"),
    definition,
  };
}

export function concessionDetail(ratePct: number, marketMedianPct: number | null): OperatingDetail {
  const definition =
    "Share of trailing-12-month listings advertising move-in incentives. Higher can signal softer demand.";
  const interpretation =
    marketMedianPct != null
      ? `${f(ratePct)}% of trailing-12-month listings advertise concessions, versus the ${f(marketMedianPct)}% market median.`
      : `${f(ratePct)}% of trailing-12-month listings advertise concessions.`;
  return {
    interpretation,
    tone: metricTone(ratePct, marketMedianPct, "higherWorse"),
    definition,
  };
}
