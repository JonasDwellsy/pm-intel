// v0.8 — Buy box fit scoring.
//
// evaluateBuyBox(pm, buyBox) → { passed, fitScore, breakdown }.
//
// Algorithm per the buy-box spec:
//
//   1. Walk excluded criteria first. If ANY match, the PM is
//      excluded entirely — return passed: false, fitScore: null.
//      Excluded matches "veto" everything that follows.
//
//   2. Walk required criteria. If any miss, the PM is excluded —
//      return passed: false, fitScore: null. Required criteria
//      are hard filters (deal breakers).
//
//   3. Walk preferred criteria. Each is weighted (0..1). Compute:
//        totalWeight  = sum of all preferred weights
//        weightedHits = sum of weight × 100 for criteria that passed
//        fitScore     = round(weightedHits / totalWeight)
//      Edge case: empty preferred list (or all weights zero) →
//      fitScore = 100 (the operator passed every hard filter, no
//      preferences to differentiate, perfect fit).
//
//   4. Return the breakdown — per-criterion pass/fail + a tally —
//      so the UI can render the "why did this operator score 87?"
//      tooltip without re-running the evaluator.
//
// Incomplete-criterion handling: criteria whose value isn't fully
// specified yet (the editor's blank "+ Add criterion" rows) are
// silently skipped — they don't veto, don't add to the breakdown,
// and don't influence the score. The editor enforces completeness
// at save time so the persisted buy box never carries blank rows;
// this guard is a defense-in-depth for the live-preview path.

import {
  type FilterCriterion,
  type PMRecord,
  type WeightedCriterion,
} from "./fields";
import { evaluateCriterion } from "./evaluator";
import { isCriterionComplete } from "./validation";

export interface BuyBoxDefinition {
  id: string;
  name: string;
  description?: string | null;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

export interface ScoreBreakdownEntry {
  field: string;
  operator: FilterCriterion["operator"];
  passed: boolean;
  /** Per-criterion contribution to the fit score (preferred only —
   *  required + excluded use 0). The breakdown still records them so
   *  the UI can show "required hit / required miss" separately. */
  weight?: number;
  contribution?: number;
}

export interface ScoreBreakdown {
  required: ScoreBreakdownEntry[];
  preferred: ScoreBreakdownEntry[];
  excluded: ScoreBreakdownEntry[];
  /** First excluded-match or required-miss that vetoed this PM.
   *  null when the PM passed all hard filters. */
  excludedBy: { layer: "excluded" | "required"; field: string; operator: FilterCriterion["operator"] } | null;
}

export interface BuyBoxEvaluation {
  /** True when the PM passed every required criterion AND no excluded
   *  criterion matched. */
  passed: boolean;
  /** 0-100 fit score against preferred criteria. null when the PM was
   *  excluded (excluded match or required miss). */
  fitScore: number | null;
  breakdown: ScoreBreakdown;
}

export function evaluateBuyBox(
  pm: PMRecord,
  buyBox: BuyBoxDefinition
): BuyBoxEvaluation {
  const breakdown: ScoreBreakdown = {
    required: [],
    preferred: [],
    excluded: [],
    excludedBy: null,
  };

  // ── 1. excluded ──────────────────────────────────────────────────
  // Walk in order so the first match becomes excludedBy. We still
  // evaluate every excluded criterion (even after a match) so the
  // breakdown is informative — but the PM is vetoed on the first hit.
  // Incomplete criteria (e.g. a fresh row the user hasn't filled in
  // yet) are silently skipped — they shouldn't tank the match count.
  for (const c of buyBox.excludedCriteria) {
    if (!isCriterionComplete(c)) continue;
    const matched = evaluateCriterion(pm, c);
    breakdown.excluded.push({
      field: c.field,
      operator: c.operator,
      passed: matched,
    });
    if (matched && breakdown.excludedBy === null) {
      breakdown.excludedBy = { layer: "excluded", field: c.field, operator: c.operator };
    }
  }
  if (breakdown.excludedBy !== null) {
    return { passed: false, fitScore: null, breakdown };
  }

  // ── 2. required ──────────────────────────────────────────────────
  for (const c of buyBox.requiredCriteria) {
    if (!isCriterionComplete(c)) continue;
    const passed = evaluateCriterion(pm, c);
    breakdown.required.push({
      field: c.field,
      operator: c.operator,
      passed,
    });
    if (!passed && breakdown.excludedBy === null) {
      breakdown.excludedBy = { layer: "required", field: c.field, operator: c.operator };
    }
  }
  if (breakdown.excludedBy !== null) {
    return { passed: false, fitScore: null, breakdown };
  }

  // ── 3. preferred ─────────────────────────────────────────────────
  let totalWeight = 0;
  let weightedHits = 0;
  for (const c of buyBox.preferredCriteria) {
    if (!isCriterionComplete(c)) continue;
    const passed = evaluateCriterion(pm, c);
    const weight = c.weight ?? 0;
    const contribution = passed ? weight * 100 : 0;
    breakdown.preferred.push({
      field: c.field,
      operator: c.operator,
      passed,
      weight,
      contribution,
    });
    totalWeight += weight;
    weightedHits += contribution;
  }

  const fitScore =
    totalWeight > 0 ? Math.round(weightedHits / totalWeight) : 100;

  return { passed: true, fitScore, breakdown };
}
