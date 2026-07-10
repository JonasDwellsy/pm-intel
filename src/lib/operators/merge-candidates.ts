// v0.23 — pure clustering for the admin operator-merge tool.
//
// Groups a single market's operators into candidate merge clusters — the
// same real operator recorded as several records (distinct source ids, no
// shared parent), differing by punctuation / legal suffix / an appended
// agent name. No I/O: the server loader supplies the operators + the set of
// already-decided cluster keys. Unit-tested.
//
// Two tiers:
//   exact    — every member's name normalizes to the same key.
//   possible — a near-match was pulled in (one name's token-set is a
//              distinctive subset of another's, e.g. "Jamie Bright, KRS
//              Holdings" ⊃ "KRS Holdings").
// Clusters already sharing a canonicalOperatorId (already linked) and any
// cluster whose key has a stored decision are excluded.
//
// v0.24 — operators include sub-eligible fragments (eligible=false) surfaced
// so a real operator's hidden pieces can be merged up to the ranking cutoff. A
// cluster is only returned when its members' combined T12 reaches
// MERGE_ELIGIBILITY_T12_MIN — the list never shows a merge that still wouldn't
// rank. Each member also carries a companyId for the Dwellsy company-page link.

export interface MergeOperator {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  claimed: boolean;
  listings: number;
  canonicalOperatorId: string | null;
  /** Dwellsy company-page id (dwellsy.com/company/<id>); null when unknown. */
  companyId: string | null;
  /** True for ranked operators (in the seed). False for sub-eligible
   *  fragments surfaced only so a real operator's hidden pieces can be merged
   *  up to eligibility — these are below the ranking cutoff and not in the
   *  seed / rankings / search. */
  eligible: boolean;
}

export type MergeTier = "exact" | "possible";

export interface MergeCluster {
  /** Normalized-name identity — the stable dedup key for a decision. */
  clusterKey: string;
  tier: MergeTier;
  canonicalNameSuggestion: string;
  survivorSlugSuggestion: string;
  members: MergeOperator[];
  /** Sum of members' T12 listings — what the merged operator would carry. */
  combinedListings: number;
}

/** Ranking eligibility cutoff (T12 listings) — mirrors pipeline.py
 *  ELIG_T12_MIN. A cluster surfaces only if its members' combined T12 reaches
 *  this, i.e. the merge would actually put the operator into the rankings.
 *  All-eligible clusters clear it trivially; it gates the newly-surfaced
 *  sub-eligible fragment clusters. */
export const MERGE_ELIGIBILITY_T12_MIN = 30;

const LEGAL_SUFFIXES = new Set([
  "inc", "llc", "llp", "lp", "ltd", "co", "corp", "corporation", "company",
]);

// Industry-generic tokens. A near-match whose shared core is ONLY these is
// not distinctive enough to propose (avoids merging unrelated firms that
// merely share "property management").
const GENERIC_TOKENS = new Set([
  "property", "properties", "management", "mgmt", "realty", "real", "estate",
  "group", "homes", "home", "rentals", "rental", "services", "service",
  "the", "of", "and",
]);

/** Grouping identity: lowercase, strip punctuation, drop legal-suffix
 *  tokens. "KRS Holdings" / "KRS Holdings Inc" / "Krs Holdings, Inc"
 *  → "krs holdings". */
export function normalizeOperatorName(name: string): string {
  const s = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const toks = s.split(" ").filter((t) => t && !LEGAL_SUFFIXES.has(t));
  return toks.join(" ") || s;
}

function tokenSet(name: string): Set<string> {
  return new Set(normalizeOperatorName(name).split(" ").filter(Boolean));
}

function isProperSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size >= b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/** A near-match core is worth proposing only if it has ≥2 tokens AND at
 *  least one non-generic token. */
function distinctiveCore(core: Set<string>): boolean {
  if (core.size < 2) return false;
  for (const t of core) if (!GENERIC_TOKENS.has(t)) return true;
  return false;
}

export function findMergeCandidates(
  ops: MergeOperator[],
  decidedKeys: Set<string> = new Set()
): MergeCluster[] {
  const n = ops.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const norms = ops.map((o) => normalizeOperatorName(o.name));
  const sets = ops.map((o) => tokenSet(o.name));

  // exact-name unions
  const byNorm = new Map<string, number[]>();
  norms.forEach((nm, i) => {
    const arr = byNorm.get(nm) ?? [];
    arr.push(i);
    byNorm.set(nm, arr);
  });
  for (const idxs of byNorm.values()) {
    for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  }

  // near-match unions (distinctive subset). O(n²) in the market's operator
  // count. Surfacing sub-eligible fragments (v0.24) grows n — the busiest
  // market (Dallas) is ~766 operators ≈ 300k pairs, still sub-second on the
  // admin render. If a market ever gets large enough to feel slow here, bucket
  // candidates by a shared distinctive token before the pairwise subset test
  // (two names can only be sub/superset if they share every token of the
  // smaller), which prunes the vast majority of pairs.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (norms[i] === norms[j]) continue;
      const small = sets[i].size <= sets[j].size ? sets[i] : sets[j];
      const big = sets[i].size <= sets[j].size ? sets[j] : sets[i];
      if (isProperSubset(small, big) && distinctiveCore(small)) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  const clusters: MergeCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => ops[i]);
    // Only surface a cluster that would clear the ranking cutoff if merged —
    // no point curating a merge that still wouldn't rank. All-eligible
    // clusters pass trivially (each member is already >= the cutoff); this
    // gates the newly-surfaced sub-eligible fragment clusters.
    const combinedListings = members.reduce((s, m) => s + m.listings, 0);
    if (combinedListings < MERGE_ELIGIBILITY_T12_MIN) continue;
    // already linked? (all share one canonical identity)
    const canonIds = new Set(members.map((m) => m.canonicalOperatorId ?? m.slug));
    if (canonIds.size === 1) continue;
    // stable clusterKey = most common normalized name (alphabetical tiebreak)
    const keyCount = new Map<string, number>();
    idxs.forEach((i) =>
      keyCount.set(norms[i], (keyCount.get(norms[i]) ?? 0) + 1)
    );
    const clusterKey = [...keyCount.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
    )[0][0];
    if (decidedKeys.has(clusterKey)) continue;
    const tier: MergeTier =
      new Set(idxs.map((i) => norms[i])).size === 1 ? "exact" : "possible";
    const sorted = [...members].sort(
      (a, b) => b.listings - a.listings || b.name.length - a.name.length
    );
    clusters.push({
      clusterKey,
      tier,
      // Default the canonical name to the SURVIVOR's name (the largest record
      // by T12 listings, sorted[0]) so it matches the default survivor radio.
      // Previously this ran a "cleanest name" heuristic that preferred the
      // most-words / longest name — often a smaller record's fuller name
      // (e.g. "Michigan Management Specialist" over the larger "Michigan
      // Management"), forcing a manual edit on nearly every merge.
      canonicalNameSuggestion: sorted[0].name,
      survivorSlugSuggestion: sorted[0].slug,
      members: sorted,
      combinedListings,
    });
  }

  return clusters.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "exact" ? -1 : 1;
    return b.members.length - a.members.length;
  });
}
