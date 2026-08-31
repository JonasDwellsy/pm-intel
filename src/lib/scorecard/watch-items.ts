// v0.25 — build categorized Watch Items: the scorecard's SYNTHESIS layer. It
// reads the same signals the metric cards + momentum already compute and
// surfaces the ones worth a human read, at thresholds consistent with (but
// noise-controlled vs) the cards. Kinds: risk (needs follow-up), data
// (limitation/caveat), context (neutral), positive. Not everything is bad.
//
// Items carry an internal severity so the most important surface first and the
// list is capped — the section is a scannable read, not an exhaustive dump.

import type { ScorecardData } from "@/lib/types";

export type WatchItemKind = "risk" | "data" | "context" | "positive";

export interface WatchItem {
  kind: WatchItemKind;
  headline: string;
  explanation: string;
  /** Follow-up question — set on risks. */
  ask?: string;
}

/** A graded operating metric, distilled from the built OperatingView so Watch
 *  Items reads the SAME normalized position + star the metric cards render. */
export interface ScoredMetricInput {
  title: string;
  /** 0..1 cohort percentile, higher = better (as on the position bar). */
  position: number | null;
  star: "gold" | "silver" | null;
}

export interface WatchTrajectoryPoint {
  date: string;
  concessionRate?: number | null;
  goldCount?: number;
  silverCount?: number;
  /** Per-metric star tier at this snapshot, so a rating move can name WHICH
   *  metric changed. Absent on cross-market aggregate points and on older
   *  recon rows → detector falls back to the tier-total signal. */
  starsPerMetric?: Record<string, "gold" | "silver" | null>;
  eligible?: boolean;
}
export interface WatchTrajectory {
  points: WatchTrajectoryPoint[];
}

const SHORT_HISTORY_YEARS = 3;
const MIN_GAP_DAYS = 80; // require ~a quarter between compared snapshots
const MAX_ITEMS = 6; // keep the section a scannable read
const WEAK_METRIC_PCTL = 0.25; // bottom-quartile position = meaningfully weak

// Concession thresholds (share of T12 listings advertising concessions).
// Two-pronged so an objectively-high rate flags even in a low-concession market
// (the old rule was purely relative — 5× market — so 60% in a 17% market slipped
// through). Absolute OR relative; two tiers.
const CONC_HEAVY_ABS = 0.6;
const CONC_HEAVY_MULT = 5;
const CONC_ELEVATED_ABS = 0.4;
const CONC_ELEVATED_MULT = 3;
const CONC_ELEVATED_FLOOR = 0.2; // relative trigger needs a real floor

// Geography: only "concentrated" when MEANINGFULLY above the cohort, not merely
// above the median (which fires for ~half the population).
const GEO_MARGIN = 0.1;

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

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Like trendPair but returns the compared POINTS, so a caller can inspect
 *  fields beyond the compared value (here: per-metric stars). */
function trendPointPair(
  points: WatchTrajectoryPoint[],
  valueOf: (p: WatchTrajectoryPoint) => number | null,
  minGapDays = MIN_GAP_DAYS
): { prev: WatchTrajectoryPoint; curr: WatchTrajectoryPoint } | null {
  const usable = points.filter((p) => valueOf(p) != null && p.date);
  if (usable.length < 2) return null;
  const curr = usable[usable.length - 1];
  for (let i = usable.length - 2; i >= 0; i--) {
    if (daysBetween(usable[i].date, curr.date) >= minGapDays) {
      return { prev: usable[i], curr };
    }
  }
  return null;
}

// Human labels for the starsPerMetric keys (the scored operating metrics).
const STAR_METRIC_LABELS: Record<string, string> = {
  leaseUp: "Lease-up speed",
  tenancy: "Tenant retention",
  rentPerformance: "Rent performance",
  marketingDiscipline: "Marketing discipline",
  inventoryTransparency: "Inventory transparency",
};
type StarTier = "gold" | "silver" | null;
const starTierRank = (s: StarTier | undefined): number =>
  s === "gold" ? 2 : s === "silver" ? 1 : 0;

interface StarMove {
  label: string;
  from: StarTier;
  to: StarTier;
}

/** Metrics whose star tier moved in `dir` between two snapshots. Empty when
 *  either point lacks per-metric stars (→ caller uses the generic wording). */
function changedStarMetrics(
  prev: Record<string, StarTier> | undefined,
  curr: Record<string, StarTier> | undefined,
  dir: "down" | "up"
): StarMove[] {
  if (!prev || !curr) return [];
  const moves: StarMove[] = [];
  for (const key of Object.keys(STAR_METRIC_LABELS)) {
    const from = (prev[key] ?? null) as StarTier;
    const to = (curr[key] ?? null) as StarTier;
    const delta = starTierRank(to) - starTierRank(from);
    if ((dir === "down" && delta < 0) || (dir === "up" && delta > 0)) {
      moves.push({ label: STAR_METRIC_LABELS[key], from, to });
    }
  }
  return moves;
}

function downgradeExplanation(moves: StarMove[]): string {
  if (moves.length === 0)
    return "The operator's star rating has slipped versus an earlier snapshot — one or more metrics fell out of the top tiers.";
  if (moves.length === 1) {
    const m = moves[0];
    return m.to === null
      ? `${m.label} fell out of the top tier versus an earlier snapshot.`
      : `${m.label} dropped from ${m.from} to ${m.to} versus an earlier snapshot.`;
  }
  return `${joinList(moves.map((m) => m.label))} slipped out of the top tiers versus an earlier snapshot.`;
}

function improvementExplanation(moves: StarMove[]): string {
  if (moves.length === 0)
    return "The operator's star rating has improved versus an earlier snapshot — operating metrics are trending into higher tiers.";
  if (moves.length === 1) {
    const m = moves[0];
    return m.from === null
      ? `${m.label} climbed into the top tier versus an earlier snapshot.`
      : `${m.label} improved from ${m.from} to ${m.to} versus an earlier snapshot.`;
  }
  return `${joinList(moves.map((m) => m.label))} moved into higher tiers versus an earlier snapshot.`;
}

// Kind order for the final sort; severity (desc) breaks ties within a kind.
const KIND_ORDER: WatchItemKind[] = ["risk", "data", "context", "positive"];

interface Ranked extends WatchItem {
  severity: number;
}

export function buildWatchItems(
  scorecard: ScorecardData,
  marketConcessionMedian: number | null,
  trajectory?: WatchTrajectory,
  scoredMetrics?: ScoredMetricInput[]
): WatchItem[] {
  const items: Ranked[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const push = (severity: number, item: WatchItem) => items.push({ ...item, severity });

  // ── RISK: concession use (absolute OR relative, two tiers) ──────────────
  let concessionLevelFired = false;
  const rate = scorecard.concessionRate ?? null;
  const mkt = marketConcessionMedian;
  if (rate != null && rate > 0) {
    const vsMarket = mkt != null ? `, versus a ${pct(mkt)} market rate` : "";
    const heavy = rate >= CONC_HEAVY_ABS || (mkt != null && rate >= mkt * CONC_HEAVY_MULT);
    const elevated =
      rate >= CONC_ELEVATED_ABS ||
      (mkt != null && rate >= Math.max(CONC_ELEVATED_FLOOR, mkt * CONC_ELEVATED_MULT));
    if (heavy) {
      concessionLevelFired = true;
      push(90, {
        kind: "risk",
        headline: "Heavy concession use",
        explanation: `${pct(rate)} of trailing-12-month listings advertise concessions${vsMarket} — a high share.`,
        ask: "Is this pricing pressure, an aggressive leasing strategy, or standardized promotional language across their listings?",
      });
    } else if (elevated) {
      concessionLevelFired = true;
      push(60, {
        kind: "risk",
        headline: "Elevated concession use",
        explanation: `${pct(rate)} of trailing-12-month listings advertise concessions${vsMarket} — above the norm, worth a look.`,
        ask: "Is demand softening in their submarkets, or a deliberate leasing push?",
      });
    }
  }

  // ── RISK: meaningfully weak scored metrics (bottom quartile) ────────────
  // The scorecard's own graded dimensions — the strongest "human read" signal.
  const goldTitles: string[] = [];
  for (const m of scoredMetrics ?? []) {
    if (m.star === "gold") goldTitles.push(m.title);
    if (m.position != null && m.position <= WEAK_METRIC_PCTL) {
      const name = m.title.toLowerCase();
      push(70, {
        kind: "risk",
        headline: `Bottom-quartile ${name}`,
        explanation: `${m.title} sits in the bottom quartile of its cohort — a weak spot versus peers.`,
        ask: `Is the weak ${name} concentrated in a few properties or portfolio-wide, and recent or persistent?`,
      });
    }
  }

  // ── DATA: short observation history ─────────────────────────────────────
  const years = scorecard.coverage?.yearsVisible ?? null;
  if (years != null && years < SHORT_HISTORY_YEARS) {
    push(40, {
      kind: "data",
      headline: "Short observation history",
      explanation: `Observed only ${years.toFixed(1)} years — shorter than the ${SHORT_HISTORY_YEARS}-year reference window, so retention estimates may be biased low. Treat retention as directional, not precise.`,
    });
  }

  // ── DATA: single / very small footprint (MF/BTR only) ───────────────────
  const isMultifamily = (scorecard.pm?.quadrant7Cell ?? "").includes("MF/BTR");
  const communities = scorecard.coverage?.observedCommunities ?? null;
  if (isMultifamily && communities != null && communities <= 2) {
    const units = scorecard.coverage?.totalObservedUnits ?? scorecard.coverage?.urusT12 ?? null;
    const months = scorecard.coverage?.monthsOnPlatform ?? null;
    push(45, {
      kind: "data",
      headline: communities === 1 ? "Single community observed" : `Limited footprint (${communities} communities)`,
      explanation: `Only ${communities === 1 ? "one community" : `${communities} communities`}${units != null ? ` (~${units} units)` : ""} observed${months != null ? ` over ${months} months` : ""}. Metrics reflect ${communities === 1 ? "one property" : "a handful of properties"}, not a portfolio — read peer comparisons, momentum, and estimates as indicative only.`,
    });
  }

  // ── CONTEXT: concentrated geography (meaningfully above cohort) ─────────
  const geo = scorecard.lendingSignals?.geographicConcentration;
  if (
    geo &&
    geo.top3CityShare != null &&
    geo.cohortMedianTop3 != null &&
    geo.top3CityShare >= geo.cohortMedianTop3 + GEO_MARGIN
  ) {
    push(20, {
      kind: "context",
      headline: "Concentrated geography",
      explanation: `${pct(geo.top3CityShare)} of inventory sits in its top 3 cities (cohort median ${pct(geo.cohortMedianTop3)}) — a plus for a focused local operator, a drawback if you need geographic diversification.`,
    });
  }

  // ── RISK (trend): concessions climbing — suppressed when a level fired ──
  if (trajectory && !concessionLevelFired) {
    const pair = trendPair(trajectory.points, (p) => p.concessionRate ?? null);
    if (pair && pair.curr >= Math.max(0.1, pair.prev * 2) && pair.curr - pair.prev >= 0.05) {
      push(55, {
        kind: "risk",
        headline: "Concession use climbing",
        explanation: `Concessions rose from ${pct(pair.prev)} to ${pct(pair.curr)} of listings over recent quarters — a sharp increase.`,
        ask: "Is this a response to softening demand, or a deliberate leasing push?",
      });
    }
  }

  // ── RISK / POSITIVE (trend): ranking or star movement ──────────────────
  if (trajectory) {
    const pts = trajectory.points;
    const last = pts[pts.length - 1];
    const droppedOut = !!last && last.eligible === false && pts.some((p) => p.eligible === true);
    if (droppedOut) {
      push(100, {
        kind: "risk",
        headline: "Recently fell below the listing threshold",
        explanation:
          "This operator met the listing threshold in an earlier snapshot but no longer does — its recent listing volume has fallen below the floor for cohort inclusion.",
        ask: "Is the operator winding down, or did its listings simply move off-platform?",
      });
    } else {
      const starTotal = (p: WatchTrajectoryPoint) =>
        p.goldCount != null || p.silverCount != null
          ? (p.goldCount ?? 0) * 2 + (p.silverCount ?? 0)
          : null;
      const pair = trendPointPair(pts, starTotal);
      const prevTotal = pair && starTotal(pair.prev);
      const currTotal = pair && starTotal(pair.curr);
      if (pair && prevTotal != null && currTotal != null && currTotal < prevTotal) {
        // Name WHICH metric(s) fell rather than asking the reader — we hold the
        // per-snapshot star history they can't see.
        const moves = changedStarMetrics(pair.prev.starsPerMetric, pair.curr.starsPerMetric, "down");
        push(80, {
          kind: "risk",
          headline: "Recent rating downgrade",
          explanation: downgradeExplanation(moves),
          ask: moves.length
            ? "Is the decline durable, or a one-quarter dip?"
            : "Which operating metric weakened, and is the change durable or a one-quarter dip?",
        });
      } else if (pair && prevTotal != null && currTotal != null && currTotal > prevTotal) {
        const moves = changedStarMetrics(pair.prev.starsPerMetric, pair.curr.starsPerMetric, "up");
        push(10, {
          kind: "positive",
          headline: "Recent rating improvement",
          explanation: improvementExplanation(moves),
        });
      }
    }
  }

  // ── POSITIVE: top-tier graded dimensions (one consolidated item) ────────
  if (goldTitles.length > 0) {
    push(5, {
      kind: "positive",
      headline:
        goldTitles.length === 1
          ? `Top-tier ${goldTitles[0].toLowerCase()}`
          : `Top-tier on ${goldTitles.length} graded dimensions`,
      // No "(top of cohort)" gloss: gold means top-of-cohort on the four
      // peer-scored metrics but clearing a fixed 80 on marketing discipline,
      // and this line can list both. The per-metric cards carry the scale.
      explanation: `Gold-tier on ${joinList(goldTitles.map((t) => t.toLowerCase()))}.`,
    });
  }

  // Sort by kind, then severity (desc) within a kind; cap to keep it scannable.
  items.sort((a, b) => {
    const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return k !== 0 ? k : b.severity - a.severity;
  });
  return items.slice(0, MAX_ITEMS).map(({ severity: _s, ...item }) => item);
}
