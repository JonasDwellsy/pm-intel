// v0.24 — pure judgment-label derivation for the redesigned scorecard.
// Labels are qualitative ONLY; the underlying percentile/composite is used to
// derive them and is never returned for display (hard constraint: no precise
// rank/composite on the scorecard). Percentiles are pre-oriented so higher =
// better on every metric (same orientation as the star logic).

export type ScoreLabel = "strong" | "good" | "neutral" | "watch" | "insufficient";

/** Percentile → judgment label. Bands: Strong ≥75 · Good 50–74 · Neutral
 *  25–49 · Watch <25 · Insufficient when the percentile is null/undefined
 *  (cohort too small to score). */
export function scoreLabel(percentile: number | null | undefined): ScoreLabel {
  if (percentile == null) return "insufficient";
  if (percentile >= 75) return "strong";
  if (percentile >= 50) return "good";
  if (percentile >= 25) return "neutral";
  return "watch";
}
