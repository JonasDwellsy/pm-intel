import type { PMListItem } from "@/lib/types";

export type OperatorSortKey = "rank" | "size" | "name";

/** Fields the ranked-operator sort actually reads. */
type Sortable = Pick<PMListItem, "totalObservedUnits" | "name" | "displayName">;

/**
 * Reorder the market "Ranked operators" list.
 *  - "rank": preserve the incoming order (the server's star ranking:
 *    gold-then-silver stars, then within-cohort rank). Returns the SAME array.
 *  - "size": largest observed portfolio first.
 *  - "name": alphabetical by displayed name (displayName ?? name).
 * Never mutates the input for size/name (returns a sorted copy).
 */
export function sortRankedOperators<T extends Sortable>(
  pms: T[],
  key: OperatorSortKey
): T[] {
  if (key === "rank") return pms;
  const copy = [...pms];
  if (key === "size") {
    copy.sort((a, b) => b.totalObservedUnits - a.totalObservedUnits);
  } else {
    copy.sort((a, b) =>
      (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name, undefined, {
        sensitivity: "base",
      })
    );
  }
  return copy;
}
