// Read-time repair of the pipeline's classificationRationale prose.
//
// The rationale is baked into the scorecardData blob at pipeline time and
// renders in three client-facing places: the operator PDF, the scorecard's
// methodology footer, and the Ask assistant's tool output. Two things in it
// were wrong, on live data, for every operator:
//
// 1. TAXONOMY. It closes with "classified as <label> at the <scale> scale",
//    where <label> came from legacy_quadrant() — the retired 4-quadrant
//    vocabulary. All 4,348 operators carrying that clause disagreed with their
//    own quadrant7Cell, and the collapse lost a real distinction: Small MF/BTR
//    Independent and Large MF/BTR Independent both printed as
//    "MF/BTR / Independent". It also repeated the scale word ("Independent at
//    the Independent scale").
//
// 2. RANK LEAK. 1,897 operators ended with "Composite rank computed on thin
//    sample — consider with caution." Rank and composite are never surfaced on
//    a scorecard; that rule has had to be enforced twice before (in the UI and
//    in Ask output). This instance survived inside pipeline-generated prose.
//
// pipeline.py is fixed too, but the seeded blob only changes on a full data
// refresh across every market. This runs at read time so both problems are off
// every surface immediately, and it stays correct afterwards: once the pipeline
// emits the right text there is simply nothing left to match.
//
// The factual body of the rationale — inventory shape, concentration share,
// observed unit count — is accurate and is left exactly as written.

/**
 * Closing clause carrying the retired label. Two shapes exist in real data:
 *   ", classified as MF/BTR / Independent at the Independent scale."
 *   ", at the Independent scale."            (the Hybrid branch)
 * The label is matched non-greedily and bounded by " at the <scale> scale" so
 * an operator name can never be swallowed.
 */
const LEGACY_CLASSIFICATION =
  /,\s*(?:classified as\s+.+?\s+)?at the (Independent|Institutional) scale\./i;

/**
 * The thin-sample caveat. Anchored on the whole sentence, never on the bare
 * word "rank" — two operators are actually named Grankol and Franklin West,
 * and a word-level match would corrupt their prose.
 */
const COMPOSITE_RANK_SENTENCE =
  /\s*Composite rank computed on thin sample\s*[—-]\s*consider with caution\./i;

/** The caveat is worth keeping — just not in terms of a rank we never show. */
const THIN_SAMPLE_REPLACEMENT =
  " Based on a thin sample of observed listings — read with caution.";

/**
 * Rewrite a pipeline rationale for display.
 *
 * @param rationale raw text off the scorecard blob
 * @param quadrant7Cell the operator's real classification, used to replace the
 *        retired label. When absent, the stale clause is dropped rather than
 *        guessed at — saying nothing beats naming the wrong cell.
 */
export function sanitizeClassificationRationale(
  rationale: string | null | undefined,
  quadrant7Cell?: string | null
): string {
  if (!rationale) return "";
  let out = rationale;

  const hadThinSample = COMPOSITE_RANK_SENTENCE.test(out);
  out = out.replace(COMPOSITE_RANK_SENTENCE, "");

  out = out.replace(LEGACY_CLASSIFICATION, () =>
    quadrant7Cell ? `, classified as ${quadrant7Cell}.` : "."
  );

  if (hadThinSample) out += THIN_SAMPLE_REPLACEMENT;

  // Tidy ONLY the seam a removal can leave behind ("… scale.  Composite" →
  // "… scale. "), never the text as a whole. A global whitespace collapse also
  // rewrites double spaces inside operator names — 13 of them in live data,
  // e.g. "Mauro  Rodriguez" — and silently reformatting a company's name is
  // not this function's job.
  return out.replace(/([.,])\s{2,}/g, "$1 ").trim();
}
