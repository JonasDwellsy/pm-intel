// v0.24 — pure judgment-label derivation for the redesigned scorecard.
// Labels are qualitative ONLY; the underlying percentile/composite is used to
// derive them and is never returned for display (hard constraint: no precise
// rank/composite on the scorecard). Percentiles are pre-oriented so higher =
// better on every metric (same orientation as the star logic).

import type { ScorecardData, CohortLevel } from "@/lib/types";

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

export type MetricKey =
  | "dom" | "tenancy" | "rentPerformance" | "marketing" | "communityVisibility";

const METRIC_KEYS: MetricKey[] = [
  "dom", "tenancy", "rentPerformance", "marketing", "communityVisibility",
];

/** Per-metric percentile at the primary 7-cell cohort level — the SAME
 *  population the per-metric stars are assigned within — falling back to the
 *  broader cohort, then the MSA/flat value. Keeps the position bar + label
 *  aligned with the cohort-relative star (the section reads "against same-cohort
 *  peers"), rather than the MSA-wide flat percentile. Internal only — never
 *  rendered as a number. */
export function metricCohortPercentile(
  scorecard: ScorecardData,
  k: MetricKey
): number | null {
  const multi = scorecard.rank?.percentilesMulti?.[k];
  if (multi) return multi.primary ?? multi.fallback ?? multi.msa ?? null;
  return scorecard.rank?.percentiles?.[k] ?? null;
}

/** Per-metric judgment labels from the cohort-level percentiles. */
export function metricLabels(scorecard: ScorecardData): Record<MetricKey, ScoreLabel> {
  const out = {} as Record<MetricKey, ScoreLabel>;
  for (const k of METRIC_KEYS) out[k] = scoreLabel(metricCohortPercentile(scorecard, k));
  return out;
}

/** The composite percentile at the cohort level that drove the composite star
 *  (primary → fallback → msa), or null when unavailable. Internal only — never
 *  rendered as a number. */
export function compositePercentile(scorecard: ScorecardData): number | null {
  const multi = scorecard.rank?.percentilesMulti?.composite;
  if (!multi) return null;
  const level: CohortLevel = scorecard.rank?.compositeCohortUsedForStar ?? "msa";
  return multi[level] ?? multi.msa ?? multi.primary ?? null;
}

/** Section-level Operating-Performance label — the internal composite
 *  percentile on the same bands. Number never shown. */
export function operatingPerformanceLabel(scorecard: ScorecardData): ScoreLabel {
  return scoreLabel(compositePercentile(scorecard));
}

/** Section-header summary: strengths (strong, then good) and the watch list
 *  (metrics in the bottom band). Insufficient-data metrics are omitted. */
export function strongestAndWatch(
  scorecard: ScorecardData
): { strongest: MetricKey[]; watch: MetricKey[] } {
  const labels = metricLabels(scorecard);
  const strong = METRIC_KEYS.filter((k) => labels[k] === "strong");
  const good = METRIC_KEYS.filter((k) => labels[k] === "good");
  const watch = METRIC_KEYS.filter((k) => labels[k] === "watch");
  return { strongest: [...strong, ...good], watch };
}
