// v0.24 — build categorized Watch Items from the signals already in the seed.
// Replaces the "Lending Signals" section. Kinds: risk (needs follow-up), data
// (limitation/caveat), context (neutral), positive. Not everything is bad.
// Trend-based detectors (concession spike, rank/star change) are added later
// once per-snapshot history exists; this phase covers point-in-time signals.

import type { ScorecardData } from "@/lib/types";

export type WatchItemKind = "risk" | "data" | "context" | "positive";

export interface WatchItem {
  kind: WatchItemKind;
  headline: string;
  explanation: string;
  /** Follow-up question — set on risks. */
  ask?: string;
}

export interface WatchTrajectoryPoint {
  date: string;
  concessionRate?: number | null;
  goldCount?: number;
  silverCount?: number;
  eligible?: boolean;
}
export interface WatchTrajectory {
  points: WatchTrajectoryPoint[];
}

const SHORT_HISTORY_YEARS = 3;
const CONCESSION_RISK_MULTIPLE = 5; // >=5x the market median flags a risk
const MIN_GAP_DAYS = 80; // require ~a quarter between compared snapshots

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Latest usable value + the newest earlier value at least minGapDays back. */
function trendPair(
  points: WatchTrajectoryPoint[],
  valueOf: (p: WatchTrajectoryPoint) => number | null,
  minGapDays = MIN_GAP_DAYS
): { prev: number; curr: number } | null {
  const usable = points.filter((p) => valueOf(p) != null && p.date);
  if (usable.length < 2) return null;
  const curr = usable[usable.length - 1];
  for (let i = usable.length - 2; i >= 0; i--) {
    if (daysBetween(usable[i].date, curr.date) >= minGapDays) {
      return { prev: valueOf(usable[i])!, curr: valueOf(curr)! };
    }
  }
  return null;
}

export function buildWatchItems(
  scorecard: ScorecardData,
  marketConcessionMedian: number | null,
  trajectory?: WatchTrajectory
): WatchItem[] {
  const items: WatchItem[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // RISK — heavy concession use vs market median.
  let concessionLevelFired = false;
  const rate = scorecard.concessionRate ?? null;
  const mkt = marketConcessionMedian;
  if (rate != null && rate > 0 && mkt != null && rate >= Math.max(0.1, mkt * CONCESSION_RISK_MULTIPLE)) {
    concessionLevelFired = true;
    items.push({
      kind: "risk",
      headline: "Heavy concession use",
      explanation: `${pct(rate)} of trailing-12-month listings mention concessions, versus a ${pct(mkt)} market median.`,
      ask: "Is this pricing pressure, an aggressive leasing strategy, or standardized promotional language in their listings?",
    });
  }

  // DATA — short observation history.
  const years = scorecard.coverage?.yearsVisible ?? null;
  if (years != null && years < SHORT_HISTORY_YEARS) {
    items.push({
      kind: "data",
      headline: "Short observation history",
      explanation: `Observed only ${years.toFixed(1)} years — shorter than the ${SHORT_HISTORY_YEARS}-year reference window, so retention estimates may be biased low. Treat retention as directional, not precise.`,
    });
  }

  // DATA — single / very small footprint: metrics describe one property, not a portfolio.
  // "Community" is an MF/BTR concept (apartment complexes); meaningless for SFR.
  const isMultifamily = (scorecard.pm?.quadrant7Cell ?? "").includes("MF/BTR");
  const communities = scorecard.coverage?.observedCommunities ?? null;
  if (isMultifamily && communities != null && communities <= 2) {
    const units = scorecard.coverage?.totalObservedUnits ?? scorecard.coverage?.urusT12 ?? null;
    const months = scorecard.coverage?.monthsOnPlatform ?? null;
    items.push({
      kind: "data",
      headline: communities === 1 ? "Single community observed" : `Limited footprint (${communities} communities)`,
      explanation: `Only ${communities === 1 ? "one community" : `${communities} communities`}${units != null ? ` (~${units} units)` : ""} observed${months != null ? ` over ${months} months` : ""}. Metrics reflect ${communities === 1 ? "one property" : "a handful of properties"}, not a portfolio — read peer comparisons, momentum, and estimates as indicative only.`,
    });
  }

  // CONTEXT — concentrated geography.
  const geo = scorecard.lendingSignals?.geographicConcentration;
  if (geo && geo.top3CityShare != null && geo.cohortMedianTop3 != null && geo.top3CityShare > geo.cohortMedianTop3) {
    items.push({
      kind: "context",
      headline: "Concentrated geography",
      explanation: `${pct(geo.top3CityShare)} of inventory sits in its top 3 cities (cohort median ${pct(geo.cohortMedianTop3)}) — a plus for a focused local operator, a drawback if you need geographic diversification.`,
    });
  }

  // POSITIVE — steady pricing (rent volatility below cohort median).
  const rs = scorecard.lendingSignals?.rentStability;
  if (rs && !rs.suppressed && rs.volatilityPP != null && rs.cohortMedianVolatility != null && rs.volatilityPP < rs.cohortMedianVolatility) {
    items.push({
      kind: "positive",
      headline: "Steady pricing",
      explanation: "Rent volatility is below the cohort median — pricing has been stable over the observed window.",
    });
  }

  // RISK (trend) — concessions climbing sharply quarter-over-quarter.
  // Suppressed when the level-based risk already fired above.
  if (trajectory && !concessionLevelFired) {
    const pair = trendPair(trajectory.points, (p) => p.concessionRate ?? null);
    if (pair && pair.curr >= Math.max(0.1, pair.prev * 2) && pair.curr - pair.prev >= 0.05) {
      items.push({
        kind: "risk",
        headline: "Concession use climbing",
        explanation: `Concessions rose from ${pct(pair.prev)} to ${pct(pair.curr)} of listings over recent quarters — a sharp increase.`,
        ask: "Is this a response to softening demand, or a deliberate leasing push?",
      });
    }
  }

  // RISK / POSITIVE (trend) — recent ranking or star movement.
  if (trajectory) {
    const pts = trajectory.points;
    const last = pts[pts.length - 1];
    const droppedOut = !!last && last.eligible === false && pts.some((p) => p.eligible === true);
    if (droppedOut) {
      items.push({
        kind: "risk",
        headline: "Recently fell below the listing threshold",
        explanation:
          "This operator met the listing threshold in an earlier snapshot but no longer does — its recent listing volume has fallen below the floor for cohort inclusion.",
        ask: "Is the operator winding down, or did its listings simply move off-platform?",
      });
    } else {
      const pair = trendPair(pts, (p) =>
        p.goldCount != null || p.silverCount != null
          ? (p.goldCount ?? 0) * 2 + (p.silverCount ?? 0)
          : null
      );
      if (pair && pair.curr < pair.prev) {
        items.push({
          kind: "risk",
          headline: "Recent rating downgrade",
          explanation:
            "The operator's star rating has slipped versus an earlier snapshot — one or more metrics fell out of the top tiers.",
          ask: "Which operating metric weakened, and is the change durable or a one-quarter dip?",
        });
      } else if (pair && pair.curr > pair.prev) {
        items.push({
          kind: "positive",
          headline: "Recent rating improvement",
          explanation:
            "The operator's star rating has improved versus an earlier snapshot — operating metrics are trending into higher tiers.",
        });
      }
    }
  }

  const order: WatchItemKind[] = ["risk", "data", "context", "positive"];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
