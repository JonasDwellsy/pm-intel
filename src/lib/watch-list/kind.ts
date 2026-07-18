// Pure, isomorphic derivation helpers — the single source of truth for
// whether a watch list has criteria, whether the criteria-match step
// should be skipped, and the list's derived display kind. No DB/React
// deps. Behavior/display now derive from content, NOT the stored
// `kind` column (which is retained only as creation intent).

type CriteriaShape = {
  requiredCriteria: readonly unknown[];
  preferredCriteria: readonly unknown[];
  excludedCriteria: readonly unknown[];
};

export type ListKind = "pinned" | "smart" | "hybrid";

export function hasCriteria(wl: CriteriaShape): boolean {
  return (
    wl.requiredCriteria.length > 0 ||
    wl.preferredCriteria.length > 0 ||
    wl.excludedCriteria.length > 0
  );
}

/** A list with no criteria must skip the natural criteria-match loops —
 *  an empty criteria set trivially "matches everyone" (see scoring.ts),
 *  which for a pins-only list would swamp the pin union. Keyed on
 *  criteria-presence so a pins-only list that GAINS criteria becomes
 *  hybrid automatically. */
export function shouldSkipCriteriaMatch(wl: CriteriaShape): boolean {
  return !hasCriteria(wl);
}

export function deriveListKind(wl: CriteriaShape, pinCount: number): ListKind {
  const criteria = hasCriteria(wl);
  const pins = pinCount > 0;
  if (criteria && pins) return "hybrid";
  if (criteria) return "smart";
  return "pinned";
}
