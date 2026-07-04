// v0.24 — classify a momentum time series into a plain-English direction.
// Volatility is checked BEFORE net direction so a noisy series is flagged
// "volatile" rather than mislabeled by its endpoints (the spec's "recent
// estimates are volatile — interpret cautiously" case).

export interface MomentumSeries {
  /** Oldest → newest. null = gap / not observed that period. */
  values: Array<number | null>;
}

export type MomentumDirection =
  | "growing" | "stable" | "declining" | "volatile" | "insufficient";

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
