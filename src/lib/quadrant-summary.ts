// Pure cohort-summary derivation for the market landing page. Extracted from
// market-data.ts (which imports prisma) so the aggregation can be unit-tested
// in isolation. Both functions derive their output from the in-memory PM list
// at render time — single source of truth across the footprint, and correct
// even for the newer markets that skipped the legacy 5-cell summary blob at
// seed time.

import type { PMListItem } from "@/lib/types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Legacy 5-cell summary (count + median DOM), still consumed by v0.6.2 callers.
export function deriveQuadrantSummary(
  pms: PMListItem[]
): Record<string, { count: number; medianDomT12: number | null }> {
  const buckets: Record<string, number[]> = {};
  for (const pm of pms) {
    const key = pm.quadrant; // normalized at seed: "Scattered / Independent" etc.
    if (!buckets[key]) buckets[key] = [];
    if (Number.isFinite(pm.domT12)) buckets[key].push(pm.domT12);
  }
  const out: Record<string, { count: number; medianDomT12: number | null }> = {};
  for (const [quadrant, doms] of Object.entries(buckets)) {
    out[quadrant] = {
      count: doms.length,
      medianDomT12: doms.length > 0 ? median(doms) : null,
    };
  }
  return out;
}

export type Quadrant7CellSummaryValue = {
  count: number;
  medianDomT12: number | null;
  medianRentVsComp: number | null;
  units: number;
  goldByMetric: {
    leaseUp: number;
    retention: number;
    rent: number;
    marketing: number;
  };
};

// v0.6.5 — the cohort tile shows cohort scale (summed observed units) and a
// gold-star-by-metric breakdown. The median DOM + rent-vs-comp fields are
// still computed because the "Operator landscape" intro paragraph reads them;
// the tile renderer picks the fields it needs. `count` counts every operator
// in the cell (not just those with a finite DOM) so it matches the ranked-list
// total the tile links to. rentVsComp is in percentage units (toPmListItem
// multiplies the decimal delta by 100) — kept in that unit space so the
// renderer can format it directly.
export function deriveQuadrant7CellSummary(
  pms: PMListItem[]
): Record<string, Quadrant7CellSummaryValue> {
  const buckets: Record<
    string,
    {
      count: number;
      doms: number[];
      rents: number[];
      units: number;
      goldByMetric: {
        leaseUp: number;
        retention: number;
        rent: number;
        marketing: number;
      };
    }
  > = {};
  for (const pm of pms) {
    const key = pm.quadrant7Cell ?? pm.quadrant;
    if (!buckets[key]) {
      buckets[key] = {
        count: 0,
        doms: [],
        rents: [],
        units: 0,
        goldByMetric: { leaseUp: 0, retention: 0, rent: 0, marketing: 0 },
      };
    }
    const b = buckets[key];
    b.count += 1;
    if (Number.isFinite(pm.domT12)) b.doms.push(pm.domT12);
    if (pm.rentVsComp !== null && Number.isFinite(pm.rentVsComp)) {
      b.rents.push(pm.rentVsComp);
    }
    if (Number.isFinite(pm.totalObservedUnits)) b.units += pm.totalObservedUnits;
    const ms = pm.metricStars;
    if (ms) {
      if (ms.leaseUp === "gold") b.goldByMetric.leaseUp += 1;
      if (ms.retention === "gold") b.goldByMetric.retention += 1;
      if (ms.rent === "gold") b.goldByMetric.rent += 1;
      if (ms.marketing === "gold") b.goldByMetric.marketing += 1;
    }
  }
  const out: Record<string, Quadrant7CellSummaryValue> = {};
  for (const [quadrant, bucket] of Object.entries(buckets)) {
    out[quadrant] = {
      count: bucket.count,
      medianDomT12: bucket.doms.length > 0 ? median(bucket.doms) : null,
      medianRentVsComp: bucket.rents.length > 0 ? median(bucket.rents) : null,
      units: bucket.units,
      goldByMetric: bucket.goldByMetric,
    };
  }
  return out;
}
