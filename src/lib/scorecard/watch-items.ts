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

const SHORT_HISTORY_YEARS = 3;
const CONCESSION_RISK_MULTIPLE = 5; // >=5x the market median flags a risk

export function buildWatchItems(
  scorecard: ScorecardData,
  marketConcessionMedian: number | null
): WatchItem[] {
  const items: WatchItem[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // RISK — heavy concession use vs market median.
  const rate = scorecard.concessionRate ?? null;
  const mkt = marketConcessionMedian;
  if (rate != null && rate > 0 && mkt != null && rate >= Math.max(0.1, mkt * CONCESSION_RISK_MULTIPLE)) {
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

  const order: WatchItemKind[] = ["risk", "data", "context", "positive"];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
