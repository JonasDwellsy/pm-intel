// Pure view-model projector for the Properties section (Phase 1 property-
// level detail, Task 4). Turns the pipeline-emitted `PropertyDetailBlock`
// (see src/lib/types.ts) into render-ready rows.
//
// Deliberately observation-only: each comparable metric gets a value + the
// MSA-median comp + a `deltaSign` — NEVER a score, star, or percentile.
// Property-level rank/scoring would let a client infer individual-listing
// performance from a handful of units, which this feature must not expose
// (mirrors the existing scorecard rank-leak guardrail — see
// scorecard-sharpening-pr1). Don't add a score/star/percentile field here;
// a later audit greps this module for those names.

import type { PropertyDetailBlock, PropertyRecord } from "@/lib/types";

export type DeltaSign = "better" | "worse" | "neutral" | null;

/** One comparable metric's value alongside its MSA-median comp and the
 *  direction-aware read on how the value sits relative to that comp. */
export interface ComparableCell {
  value: number | null;
  comp: number | null;
  deltaSign: DeltaSign;
}

/** One row of the Properties table — a community or an SFR-submarket
 *  rollup, its raw descriptive fields, plus the four comparable metrics
 *  wrapped as `ComparableCell`s. */
export interface PropertyRowVM {
  kind: PropertyRecord["kind"];
  label: string;
  submarket: string | null;
  units: number | null;
  homes: number | null;
  nListings: number;
  /** Raw marketing-composite observation for this property's listings.
   *  NOT a percentile/star — no cohort comparison is made against it, so
   *  it's rendered as a plain figure (see module docstring). */
  listingQuality: number | null;
  medianDomT12: ComparableCell;
  medianRentT12: ComparableCell;
  rentYoY: ComparableCell;
  concessionRate: ComparableCell;
}

type CompareDirection = "lowerBetter" | "higherBetter" | "level";

/** Direction-aware delta-sign + comp pairing for one metric.
 *  - lowerBetter (DOM, concessionRate): value < comp → "better".
 *  - higherBetter (rentYoY): value > comp → "better".
 *  - level (medianRentT12): always "neutral" when both are present — a
 *    rent level is a fact, not a performance judgment.
 *  Either side missing (or, for a comparison, equal values) fall out to
 *  null/"neutral" respectively — never a spurious direction. */
function compareCell(
  value: number | null,
  comp: number | null,
  direction: CompareDirection
): ComparableCell {
  if (value == null || comp == null) {
    return { value, comp, deltaSign: null };
  }
  if (direction === "level") {
    return { value, comp, deltaSign: "neutral" };
  }
  if (value === comp) {
    return { value, comp, deltaSign: "neutral" };
  }
  const valueIsLower = value < comp;
  if (direction === "lowerBetter") {
    return { value, comp, deltaSign: valueIsLower ? "better" : "worse" };
  }
  // higherBetter
  return { value, comp, deltaSign: valueIsLower ? "worse" : "better" };
}

/** Project a `PropertyDetailBlock` into render-ready rows. Preserves the
 *  block's existing sort order (pipeline sorts by nListings desc, label
 *  asc) — the UI re-sorts client-side on top of this. */
export function projectPropertyRows(
  block: PropertyDetailBlock
): PropertyRowVM[] {
  const { comps } = block;
  return block.properties.map((p) => ({
    kind: p.kind,
    label: p.label,
    submarket: p.submarket,
    units: p.units,
    homes: p.homes,
    nListings: p.nListings,
    listingQuality: p.listingQuality,
    medianDomT12: compareCell(p.medianDomT12, comps.medianDomT12, "lowerBetter"),
    medianRentT12: compareCell(p.medianRentT12, comps.medianRentT12, "level"),
    rentYoY: compareCell(p.rentYoY, comps.rentYoY, "higherBetter"),
    concessionRate: compareCell(p.concessionRate, comps.concessionRate, "lowerBetter"),
  }));
}
