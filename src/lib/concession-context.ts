// v0.6.4 Patch 2 — runtime helper for the Layer 5 ConcessionActivity
// section. Computes the focal operator's place relative to the market
// concession-rate cohort median + classifies the accent (high / low /
// neutral). Server-side: consumes the msaPool already loaded by the
// scorecard route handler, so no extra DB round-trips.

import type { PoolPm } from "@/lib/msa-pool";
import type { ScorecardData } from "@/lib/types";

export interface ConcessionContext {
  /** Focal operator's concession rate (0-1) or null when the operator
   *  was absent from the classifier CSV input. */
  rate: number | null;
  /** Focal operator's count of concession-mentioning T12 listings. */
  listingCount: number;
  /** Focal operator's T12 listing total (denominator). */
  t12Listings: number;
  /** Pattern identifiers ordered by frequency, e.g.
   *  ["move_in_special", "free_month_lease"]. Always an array, possibly
   *  empty. */
  patterns: string[];
  /** Single representative listing excerpt — back-compat for any reader
   *  that hasn't migrated to the samples array yet. Null when none is
   *  available. */
  sampleText: string | null;
  /** Up to 3 distinct sample excerpts. Authoritative for the UI; the
   *  Layer 5 section renders each as a separate blockquote so prospects
   *  see varied concession types side-by-side. Falls back to a
   *  1-element array built from sampleText when the seed predates the
   *  array field; empty array when no samples are available at all. */
  samples: string[];
  /** Median concession rate across the focal market's ranked operators
   *  with non-null concessionRate. Null when the cohort is empty. */
  marketMedianRate: number | null;
  /** Cohort size used for the median (count of ranked operators with
   *  non-null concessionRate). Surfaces in the methodology disclosure
   *  when needed. */
  cohortSize: number;
  /** Color-accent classification per spec:
   *    high    — rate > median + 0.20 (i.e. 20pp above)
   *    low     — rate < median - 0.20 (20pp below)
   *    neutral — otherwise, or when median is unavailable
   *  Null when the focal operator's rate is itself null. */
  accent: "high" | "low" | "neutral" | null;
}

const ACCENT_THRESHOLD_PP = 0.20; // 20pp above/below median triggers accent

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function buildConcessionContext(
  focalScorecard: ScorecardData,
  msaPool: PoolPm[]
): ConcessionContext {
  // Cohort: every ranked PM in the market with a non-null concessionRate.
  // Operators with null (absent from the classifier CSV) are excluded so
  // they don't pull the median down. The msaPool is the canonical ranked
  // set per the scorecard route loader.
  const cohortRates: number[] = [];
  for (const p of msaPool) {
    const r = p.scorecard.concessionRate;
    if (typeof r === "number") cohortRates.push(r);
  }
  const marketMedianRate = median(cohortRates);

  const rate =
    typeof focalScorecard.concessionRate === "number"
      ? focalScorecard.concessionRate
      : null;
  const listingCount = focalScorecard.concessionListingCount ?? 0;
  const t12Listings = focalScorecard.coverage.t12Listings;
  const patterns = focalScorecard.concessionPatterns ?? [];
  const sampleText = focalScorecard.concessionSampleText ?? null;
  // Samples array is authoritative; fall back to a 1-element array
  // synthesized from the single sampleText field for any pre-array
  // seed run that downstream readers might still hit.
  const rawSamples = Array.isArray(focalScorecard.concessionSamples)
    ? focalScorecard.concessionSamples.filter(
        (s): s is string => typeof s === "string" && s.length > 0
      )
    : [];
  const samples =
    rawSamples.length > 0
      ? rawSamples.slice(0, 3)
      : sampleText
        ? [sampleText]
        : [];

  let accent: ConcessionContext["accent"] = null;
  if (rate !== null) {
    if (marketMedianRate === null) {
      accent = "neutral";
    } else if (rate > marketMedianRate + ACCENT_THRESHOLD_PP) {
      accent = "high";
    } else if (rate < marketMedianRate - ACCENT_THRESHOLD_PP) {
      accent = "low";
    } else {
      accent = "neutral";
    }
  }

  return {
    rate,
    listingCount,
    t12Listings,
    patterns,
    sampleText,
    samples,
    marketMedianRate,
    cohortSize: cohortRates.length,
    accent,
  };
}

// Pattern identifier → human-readable label. Used by the Layer 5
// renderer to render up to 3 pattern badges. Unknown identifiers fall
// through to a passthrough that humanizes underscores so future
// classifier additions don't crash the section.
const PATTERN_LABELS: Record<string, string> = {
  free_month_lease: "Free month(s)",
  free_month_lease2: "Free month(s)",
  months_free_multi: "Free month(s)",
  percent_off: "% off",
  half_off: "% off",
  dollar_off: "$ off",
  no_deposit: "No / reduced deposit",
  move_in_special: "Move-in special",
  explicit_concession: "Concession mentioned",
  rent_reduction: "Rent reduction",
  lease_special: "Lease special",
  limited_offer: "Limited time offer",
  waived_fee: "Waived fee",
  free_rent: "Free rent",
};

export function humanizeConcessionPattern(id: string): string {
  return (
    PATTERN_LABELS[id] ??
    id
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

/** Dedupe pattern labels to the unique display set (Free month(s) is
 *  emitted by 3 raw identifiers — we only want one chip), preserving
 *  the order of first appearance in the input. */
export function uniquePatternLabels(rawIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of rawIds) {
    const label = humanizeConcessionPattern(id);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Wrap a concession sample excerpt with ellipses on either end when the
 *  text appears to start or end mid-sentence. The classifier emits
 *  fixed-width snippets from listing descriptions, so the cut points
 *  often land mid-word ("er applicant…") or mid-clause ("…into the
 *  heart of"). Wrapping makes the truncation explicit instead of
 *  reading as a typo. Rules:
 *
 *    - Prefix "…" when the first non-whitespace character is not
 *      a capital letter or a sentence-opening symbol ($, ", ', etc.)
 *      and the text doesn't already start with an ellipsis.
 *    - Suffix "…" when the last non-whitespace character is not a
 *      sentence-terminator (. ! ? ") and the text doesn't already
 *      end with an ellipsis.
 *
 *  Uses the U+2026 HORIZONTAL ELLIPSIS character rather than three
 *  periods, matching the dq-mono / Inter rendering elsewhere.
 */
export function formatConcessionSample(raw: string): string {
  // Normalize leading/trailing ASCII triple-dots to the U+2026 ellipsis
  // character first. The classifier occasionally emits "..." (three
  // periods) at a truncation boundary; we want a single typographic
  // ellipsis there, not three full stops the prefix/suffix logic below
  // would misread as terminal punctuation.
  const text = raw
    .trim()
    .replace(/^\.{3,}/, "…")
    .replace(/\.{3,}$/, "…");
  if (text.length === 0) return text;

  // Front: capital letter, or a sentence-opening symbol (currency,
  // quote, hash, etc.). Anything else gets a leading ellipsis.
  const firstChar = text[0];
  const startsCleanly =
    /[A-Z]/.test(firstChar) ||
    /[$"'(*#@]/.test(firstChar) ||
    text.startsWith("…");
  const needsPrefix = !startsCleanly;

  // Back: terminal punctuation closes the snippet cleanly. Anything
  // else (mid-word, mid-clause, trailing comma) gets a trailing
  // ellipsis. A trailing close-quote is treated as terminal because
  // the classifier sometimes ends snippets right after a quoted phrase.
  const lastChar = text[text.length - 1];
  const endsCleanly =
    /[.!?]/.test(lastChar) ||
    lastChar === '"' ||
    lastChar === "'" ||
    text.endsWith("…");
  const needsSuffix = !endsCleanly;

  return `${needsPrefix ? "…" : ""}${text}${needsSuffix ? "…" : ""}`;
}
