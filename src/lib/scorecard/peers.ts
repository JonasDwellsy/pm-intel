// v0.24 — "Similar local players": operators in the same market (caller-
// filtered) + same 7-cell classification, closest in estimated size to the
// focal operator. The focal is always included so the reader sees it in
// context. Pure — the caller supplies the candidate list from the seed.

import type { ScoreLabel } from "./labels";

export interface PeerCandidate {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  estimatedUnits: number | null;
  operatingLabel: ScoreLabel;
}

export interface SelectedPeer extends PeerCandidate {
  isFocal: boolean;
  /** 0–1 vs the largest in the returned set — drives the size bar. */
  relativeSize: number;
}

export function selectSimilarLocalPlayers(
  focalSlug: string,
  candidates: PeerCandidate[],
  opts: { limit?: number } = {}
): SelectedPeer[] {
  const limit = opts.limit ?? 5;
  const focal = candidates.find((c) => c.slug === focalSlug);
  if (!focal) return [];

  const sameCell = candidates.filter(
    (c) => c.quadrant7Cell === focal.quadrant7Cell && c.slug !== focalSlug
  );
  const sizeDist = (c: PeerCandidate) =>
    c.estimatedUnits == null || focal.estimatedUnits == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(c.estimatedUnits - focal.estimatedUnits);

  const nearest = [...sameCell]
    .sort((a, b) => sizeDist(a) - sizeDist(b))
    .slice(0, Math.max(0, limit - 1));

  const chosen = [focal, ...nearest];
  const maxUnits = Math.max(...chosen.map((c) => c.estimatedUnits ?? 0), 1);

  return chosen
    .map((c) => ({
      ...c,
      isFocal: c.slug === focalSlug,
      relativeSize: (c.estimatedUnits ?? 0) / maxUnits,
    }))
    .sort((a, b) => (b.estimatedUnits ?? 0) - (a.estimatedUnits ?? 0));
}
