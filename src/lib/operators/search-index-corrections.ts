// Pure overlay: apply admin name corrections onto the offline-built search
// index tiers so a corrected operator is shown + searchable by its new name.
// NO IO, NO "@/" imports — scripts/build-operator-universe.ts imports this via
// a relative path under tsx. Corrections target ranked PMs (by slug) and
// canonical groups (by canonicalSlug); the tracked tier is never targeted.


export interface RankedEntryName {
  slug: string;
  name: string;
  aliases?: string[];
}
export interface CanonicalEntryName {
  canonicalSlug: string;
  name: string;
  aliases?: string[];
}
export interface NameCorrection {
  targetKind: string;
  targetKey: string;
  correctedName: string;
  originalName?: string;
}

/** Mutates the passed ranked/canonical entries' `name` fields in place.
 *  Returns how many corrections matched an entry, and the targetKeys that
 *  matched nothing (expected for a `pm` correction on a grouped member — it
 *  has no standalone ranked row — so callers log rather than fail). */
export function applyNameCorrectionsToSearchIndex(
  index: { ranked: RankedEntryName[]; canonical: CanonicalEntryName[] },
  corrections: NameCorrection[]
): { matched: number; unmatched: string[] } {
  const rankedBySlug = new Map<string, RankedEntryName>();
  for (const e of index.ranked) rankedBySlug.set(e.slug, e);
  const canonBySlug = new Map<string, CanonicalEntryName>();
  for (const e of index.canonical) canonBySlug.set(e.canonicalSlug, e);

  let matched = 0;
  const unmatched: string[] = [];
  for (const c of corrections) {
    let entry: RankedEntryName | CanonicalEntryName | undefined;
    if (c.targetKind === "pm") entry = rankedBySlug.get(c.targetKey);
    else if (c.targetKind === "canonical") entry = canonBySlug.get(c.targetKey);
    if (entry) {
      // A name CORRECTION is a fix, not a rename: set the corrected name and do
      // NOT keep the pre-correction name as an alias. Aliasing it would
      // re-surface the very error we corrected (e.g. "also: Fischer Assert
      // Management" under "Fischer Asset Management"). Legitimate former names /
      // DBAs are aliased separately (build-operator-universe's dbaAlias); the
      // old spelling stays findable via fuzzy match on the corrected name.
      entry.name = c.correctedName;
      matched += 1;
    } else {
      unmatched.push(c.targetKey);
    }
  }
  return { matched, unmatched };
}
