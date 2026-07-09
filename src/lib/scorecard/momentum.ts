// v0.24 — classify a momentum time series into a plain-English direction.
// Volatility is checked BEFORE net direction so a noisy series is flagged
// "volatile" rather than mislabeled by its endpoints (the spec's "recent
// estimates are volatile — interpret cautiously" case).

export interface MomentumSeries {
  /** Oldest → newest. null = gap / not observed that period. */
  values: Array<number | null>;
}

export type MomentumDirection =
  | "growing" | "stable" | "declining" | "volatile" | "mixed" | "insufficient";

export function momentumDirection(
  series: MomentumSeries,
  opts: { minPoints?: number; flatBandPct?: number; volatilityPct?: number } = {}
): MomentumDirection {
  const { minPoints = 3, flatBandPct = 0.05, volatilityPct = 0.4 } = opts;
  const pts = series.values.filter((v): v is number => v != null);
  if (pts.length < minPoints) return "insufficient";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const base = Math.abs(first) || 1;

  // Volatility: largest period-over-period swing relative to the base.
  let maxSwing = 0;
  for (let i = 1; i < pts.length; i++) {
    maxSwing = Math.max(maxSwing, Math.abs(pts[i] - pts[i - 1]) / base);
  }
  const netChange = (last - first) / base;
  if (maxSwing >= volatilityPct && Math.abs(netChange) < maxSwing / 2) {
    return "volatile";
  }
  if (netChange > flatBandPct) return "growing";
  if (netChange < -flatBandPct) return "declining";
  return "stable";
}

/**
 * Section-level momentum badge from the per-sparkline directions the user sees.
 * Diverging arrows (at least one up AND one down) → "mixed"; otherwise the
 * consensus direction. Volatile only decides the badge when nothing else has a
 * clean direction. "insufficient" inputs are ignored; all-insufficient →
 * "insufficient".
 */
export function aggregateSectionDirection(dirs: MomentumDirection[]): MomentumDirection {
  const shown = dirs.filter((d) => d !== "insufficient");
  if (shown.length === 0) return "insufficient";
  const up = shown.filter((d) => d === "growing").length;
  const down = shown.filter((d) => d === "declining").length;
  const vol = shown.filter((d) => d === "volatile").length;
  if (up > 0 && down > 0) return "mixed";
  if (up > 0) return "growing";
  if (down > 0) return "declining";
  if (vol > 0) return "volatile";
  return "stable";
}

export interface MomentumProfile {
  /** first observed → latest (growing / stable / declining). */
  net: "growing" | "stable" | "declining";
  /** last window (~last quarter of the series, min 3 / max 8 points). */
  recent: "growing" | "stable" | "declining";
  /** large period-over-period swings relative to a small net change. */
  volatile: boolean;
  /** false when fewer than minPoints observations. */
  hasEnough: boolean;
}

/**
 * Richer profile than momentumDirection: reports BOTH the long-run net direction
 * and the recent-window direction so the narrative can say "grew overall but
 * pulled back recently". `net`/`recent` are pure directional (flat-band) reads —
 * unlike momentumDirection, they never collapse to "volatile"; `volatile` is a
 * separate flag the caller can layer on. Each direction is measured relative to
 * its own window's start, so it's scale-invariant.
 */
export function momentumProfile(
  series: MomentumSeries,
  opts: { minPoints?: number; flatBandPct?: number; volatilityPct?: number } = {}
): MomentumProfile {
  const { minPoints = 3, flatBandPct = 0.05, volatilityPct = 0.4 } = opts;
  const pts = series.values.filter((v): v is number => v != null);
  if (pts.length < minPoints) {
    return { net: "stable", recent: "stable", volatile: false, hasEnough: false };
  }
  const dirOf = (a: number, b: number): "growing" | "stable" | "declining" => {
    const change = (b - a) / (Math.abs(a) || 1);
    if (change > flatBandPct) return "growing";
    if (change < -flatBandPct) return "declining";
    return "stable";
  };
  const net = dirOf(pts[0], pts[pts.length - 1]);
  const window = Math.min(8, Math.max(3, Math.round(pts.length * 0.25)));
  const recentPts = pts.slice(-window);
  const recent = dirOf(recentPts[0], recentPts[recentPts.length - 1]);

  const base = Math.abs(pts[0]) || 1;
  let maxSwing = 0;
  for (let i = 1; i < pts.length; i++) {
    maxSwing = Math.max(maxSwing, Math.abs(pts[i] - pts[i - 1]) / base);
  }
  const netChange = (pts[pts.length - 1] - pts[0]) / base;
  const volatile = maxSwing >= volatilityPct && Math.abs(netChange) < maxSwing / 2;

  return { net, recent, volatile, hasEnough: true };
}
