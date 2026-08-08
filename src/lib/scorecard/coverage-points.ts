// Coverage-map point encoding.
//
// These are the dots on an operator's coverage map: one per observed unit,
// capped at 200 per operator. There are 366,641 of them across the book, and
// they were the single heaviest thing in the committed seed — 19.7 MB of a
// 54 MB file, 36% of the whole thing.
//
// The old shape spent 56 bytes per point:
//   {"lat":34.9339,"lon":-85.2861,"n":1,"city":"Rossville"}
// repeating four keys 366,641 times, plus a `city` that nothing reads. Two
// producer comments claimed city fed "city labels on the PDF map" — that
// feature does not exist in the current code. The PDF draws bare circles and
// gets its place names from the Mapbox basemap.
//
// The tuple shape spends 19:
//   [34.9339,-85.2861,1]
//
// Why this matters beyond tidiness: the seed is a committed file, and GitHub
// hard-rejects anything over 100 MB. At 54 MB and climbing ~9 MB per refresh,
// that wall was a few refreshes away. This buys the room back.
//
// BOTH shapes are readable, on purpose. The seeded scorecardData blobs in the
// database still hold the object form until the next reseed, so a deploy that
// shipped tuple-only readers would blank every coverage map in the window
// between deploy and reseed. The object branch is cheap and stays.

/** Wire form: compact tuple (current) or the legacy object (pre-reseed blobs). */
export type CoverageMapPoint =
  | readonly [lat: number, lon: number, n: number]
  | { lat: number; lon: number; n?: number; city?: string };

/** What every renderer actually wants. */
export interface CoveragePoint {
  lat: number;
  lon: number;
  /** Units at this coordinate. Legacy points without it count as 1. */
  n: number;
}

/** Decode one point of either shape. Returns null for malformed input so a
 *  bad row is skipped rather than plotted at (0, 0) — the Gulf of Guinea
 *  failure mode, which looks like real data on a US map that's been zoomed
 *  to fit its own points. */
export function readCoveragePoint(p: CoverageMapPoint | null | undefined): CoveragePoint | null {
  if (!p) return null;
  if (Array.isArray(p)) {
    const [lat, lon, n] = p;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, n: Number.isFinite(n) ? (n as number) : 1 };
  }
  const o = p as { lat: number; lon: number; n?: number };
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return null;
  return { lat: o.lat, lon: o.lon, n: Number.isFinite(o.n) ? (o.n as number) : 1 };
}

/** Decode a list, dropping anything malformed. */
export function readCoveragePoints(
  points: ReadonlyArray<CoverageMapPoint> | null | undefined
): CoveragePoint[] {
  if (!points) return [];
  const out: CoveragePoint[] = [];
  for (const p of points) {
    const decoded = readCoveragePoint(p);
    if (decoded) out.push(decoded);
  }
  return out;
}
