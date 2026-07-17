// Pure alias helpers for the search index. NO IO, NO "@/" imports —
// build-operator-universe.ts (and search-index-corrections.ts) import this
// via relative paths under tsx.

/** Push `candidate` onto `aliases` iff it's non-empty, differs
 *  case-insensitively from `primary` (the display name), and isn't already
 *  present (case-insensitive). Trims. Mutates `aliases`. */
export function addAlias(
  aliases: string[],
  candidate: string | null | undefined,
  primary: string
): void {
  if (!candidate) return;
  const c = candidate.trim();
  if (!c) return;
  if (c.toLowerCase() === primary.trim().toLowerCase()) return;
  if (aliases.some((a) => a.toLowerCase() === c.toLowerCase())) return;
  aliases.push(c);
}

/** The DBA/operating-company alias for a single-market operator: its
 *  canonicalOperatorName when it differs case-insensitively from its display
 *  name (the exact rule toPmListItem uses for displayName). Null otherwise. */
export function dbaAlias(
  name: string,
  canonicalOperatorName?: string | null
): string | null {
  if (!canonicalOperatorName) return null;
  const c = canonicalOperatorName.trim();
  if (!c || c.toLowerCase() === name.trim().toLowerCase()) return null;
  return c;
}
