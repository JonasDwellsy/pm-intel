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

// v0.8 — Marketing Discipline is scored on an ABSOLUTE bar, not a cohort.
//
// Every other metric answers "how does this operator compare to its peers?",
// so a percentile is the right currency. Marketing does not: a listing is
// complete or it is not, and the standard does not move because the operators
// down the road are sloppier. Jonas's rule for it — "good is good, regardless
// of the local comparative set."
//
// These bands mirror the star thresholds in pipeline.py
// (MARKETING_GOLD_MIN / MARKETING_SILVER_MIN) and MUST move with them. The
// 50-point watch line is the one addition: it is the natural half-mark of a
// 0-100 quality score, and on the shipped seed it lands within a point of the
// 25th percentile (50.7), so "watch" is the bottom quartile read either way.
export const MARKETING_GOLD_MIN = 80;
export const MARKETING_SILVER_MIN = 70;
export const MARKETING_WATCH_MAX = 50;

/** Marketing composite (0-100) → judgment label, on the absolute bar. */
export function marketingAbsoluteLabel(score: number | null | undefined): ScoreLabel {
  if (score == null) return "insufficient";
  if (score >= MARKETING_GOLD_MIN) return "strong";
  if (score >= MARKETING_SILVER_MIN) return "good";
  if (score >= MARKETING_WATCH_MAX) return "neutral";
  return "watch";
}

/** Metrics whose label, star and position bar are cohort-relative. Marketing
 *  is deliberately absent — see marketingAbsoluteLabel. Exported because the
 *  section takeaway makes a claim specifically about cohort medians and may
 *  only count these. */
export const COHORT_SCORED_KEYS: MetricKey[] = [
  "dom", "tenancy", "rentPerformance", "communityVisibility",
];

/** Per-metric percentile at the primary 7-cell cohort level — the SAME
 *  population the per-metric stars are assigned within — falling back to the
 *  broader cohort, then the MSA/flat value. Keeps the position bar + label
 *  aligned with the cohort-relative star (the section reads "against same-cohort
 *  peers"), rather than the MSA-wide flat percentile. Internal only — never
 *  rendered as a number.
 *
 *  Still defined for marketing (the watch-items layer and peer table read it),
 *  but marketing's own card no longer displays it. */
export function metricCohortPercentile(
  scorecard: ScorecardData,
  k: MetricKey
): number | null {
  const multi = scorecard.rank?.percentilesMulti?.[k];
  if (multi) return multi.primary ?? multi.fallback ?? multi.msa ?? null;
  return scorecard.rank?.percentiles?.[k] ?? null;
}

/** Per-metric judgment labels. Cohort percentile for the four peer-scored
 *  metrics; the absolute bar for marketing, so the chip cannot say "strong"
 *  about a 25-point composite just because the local cohort is worse. */
export function metricLabels(scorecard: ScorecardData): Record<MetricKey, ScoreLabel> {
  const out = {} as Record<MetricKey, ScoreLabel>;
  for (const k of METRIC_KEYS) {
    out[k] = k === "marketing"
      ? marketingAbsoluteLabel(scorecard.marketing?.compositeScore)
      : scoreLabel(metricCohortPercentile(scorecard, k));
  }
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
