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

export interface MergeOperator {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  claimed: boolean;
  listings: number;
  canonicalOperatorId: string | null;
}

export type MergeTier = "exact" | "possible";

export interface MergeCluster {
  /** Normalized-name identity — the stable dedup key for a decision. */
  clusterKey: string;
  tier: MergeTier;
  canonicalNameSuggestion: string;
  survivorSlugSuggestion: string;
  members: MergeOperator[];
}

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

/** Cleanest display name: most word boundaries, then longest — mirrors the
 *  pipeline's display-variant picker (prefers "Equity Team" over
 *  "Equityteam"). */
function pickCanonical(names: string[]): string {
  return [...names].sort((a, b) => {
    const boundaries = b.split(/\s+/).length - a.split(/\s+/).length;
    return boundaries !== 0 ? boundaries : b.length - a.length;
  })[0];
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

  // near-match unions (distinctive subset)
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
      canonicalNameSuggestion: pickCanonical(members.map((m) => m.name)),
      survivorSlugSuggestion: sorted[0].slug,
      members: sorted,
    });
  }

  return clusters.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "exact" ? -1 : 1;
    return b.members.length - a.members.length;
  });
}
