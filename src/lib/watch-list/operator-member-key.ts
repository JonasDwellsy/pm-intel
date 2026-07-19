import type { PMSearchResult } from "@/lib/pm-search";

// v0.27 (Task 6) — the watch-list pin key for a search row. Only "ranked"
// (single-market, has a scorecard `slug`) and "canonical" (multi-market,
// has a `canonicalSlug`) tiers carry a PM/canonical identity that the
// pin system's `canonicalOperatorId ?? pmSlug` convention (see apply.ts)
// can key on. "tracked" rows are below the ranking threshold — no PM
// record, no scorecard, no slug of any kind — so there's nothing to pin
// to (a pin nobody can ever resolve back to an operator). "market" rows
// aren't operators at all. Returns null for both, which callers treat
// as "don't mount the control" / "not addable".
//
// Originally lived inline in SearchResultRow.tsx (search-row pin
// button); extracted here (operator-roster watch lists, Task 2) so the
// "Watch operators" search-and-add modal can reuse the exact same,
// already-shipped derivation rather than re-deriving it — a second,
// subtly different implementation here would be a latent correctness
// bug waiting to diverge from the pin system's actual key convention.
export function operatorMemberKey(result: PMSearchResult): string | null {
  if (result.tier === "canonical") return result.canonicalSlug;
  if (result.tier === "ranked") return result.slug;
  return null;
}
