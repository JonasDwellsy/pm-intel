import Link from "next/link";
import {
  QUADRANT7_COLORS,
  quadrant7Key,
  type Quadrant7CellKey,
} from "@/lib/quadrant7-colors";
import { fmtInt } from "@/lib/format";
import type { Quadrant7CellSummaryValue } from "@/lib/quadrant-summary";

// v0.7 — the market "Operator landscape" section. Replaces the seven
// equal-weight cohort tiles (QuadrantSummaryCard) with a compact,
// skew-honest composition strip + named standouts. The old tiles gave a
// 1-operator cohort the same visual weight as a 35-operator one and showed
// denominator-less per-cohort star tallies. This expresses the same cohort
// data as one proportional bar (segment width ∝ operator count), a detail
// legend that carries the exact counts + est. units, and the market's actual
// top-starred operators — the decision-useful signal the tallies gestured at.

export type LandscapeStandout = {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  goldCount: number;
  silverCount: number;
};

// Canonical quadrant7Cell label → color key + filtered-segment slug. Segment
// slugs match the ranked-list filter URLs, so a bar segment / legend row lands
// on the same filtered view the old tiles did.
const COHORT_META: Array<{
  cellKey: Quadrant7CellKey;
  canonicalLabel: string;
  segment: string;
}> = [
  { cellKey: "sfr-ind", canonicalLabel: "SFR Independent", segment: "sfr-independent" },
  { cellKey: "sfr-inst", canonicalLabel: "SFR Institutional", segment: "sfr-institutional" },
  { cellKey: "small-mfbtr-ind", canonicalLabel: "Small MF/BTR Independent", segment: "small-mfbtr-independent" },
  { cellKey: "small-mfbtr-inst", canonicalLabel: "Small MF/BTR Institutional", segment: "small-mfbtr-institutional" },
  { cellKey: "large-mfbtr-ind", canonicalLabel: "Large MF/BTR Independent", segment: "large-mfbtr-independent" },
  { cellKey: "large-mfbtr-inst", canonicalLabel: "Large MF/BTR Institutional", segment: "large-mfbtr-institutional" },
  { cellKey: "hybrid", canonicalLabel: "Hybrid", segment: "hybrid" },
];

function lookup(
  summary: Record<string, Quadrant7CellSummaryValue>,
  canonicalLabel: string,
  cellKey: Quadrant7CellKey
): Quadrant7CellSummaryValue | null {
  return (
    summary[canonicalLabel] ??
    Object.entries(summary).find(([k]) => quadrant7Key(k) === cellKey)?.[1] ??
    null
  );
}

export function MarketCompositionStrip({
  summary,
  standouts,
  marketHref,
}: {
  summary: Record<string, Quadrant7CellSummaryValue>;
  standouts: LandscapeStandout[];
  marketHref: string;
}) {
  const rows = COHORT_META.map((m) => {
    const s = lookup(summary, m.canonicalLabel, m.cellKey);
    return {
      ...m,
      count: s?.count ?? 0,
      units: s?.units ?? 0,
      color: QUADRANT7_COLORS[m.cellKey],
    };
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) return null;

  const totalOps = rows.reduce((n, r) => n + r.count, 0);
  const totalUnits = rows.reduce((n, r) => n + r.units, 0);
  const barLabel = rows.map((r) => `${r.color.label} ${r.count}`).join(", ");

  return (
    <div>
      {/* Totals */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        <span>
          <span className="dq-mono text-[16px] font-medium text-navy">
            {fmtInt(totalOps)}
          </span>{" "}
          operators
        </span>
        <span>
          ~
          <span className="dq-mono text-[16px] font-medium text-navy">
            {fmtInt(totalUnits)}
          </span>{" "}
          est. managed units
        </span>
        <span>
          <span className="dq-mono text-[16px] font-medium text-navy">
            {rows.length}
          </span>{" "}
          cohort{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Composition bar — segment width ∝ operator count. Tiny cohorts keep a
          min-width so they stay visible + clickable; the legend carries exact
          numbers. Labels render only in segments wide enough to hold them. */}
      <div
        role="img"
        aria-label={`Operator mix by cohort: ${barLabel}.`}
        className="flex h-[46px] w-full gap-0.5 overflow-hidden rounded-lg"
      >
        {rows.map((r) => {
          const wide = r.count / totalOps >= 0.12;
          return (
            <Link
              key={r.cellKey}
              href={`${marketHref}/${r.segment}`}
              aria-label={`View ${r.color.label} operators`}
              className="flex items-center overflow-hidden transition-opacity hover:opacity-90"
              style={{
                flexGrow: r.count,
                flexBasis: 0,
                minWidth: 14,
                backgroundColor: r.color.fg,
                paddingLeft: wide ? 12 : 0,
              }}
            >
              {wide && (
                <span className="dq-tnum truncate text-[12.5px] font-medium text-white">
                  {r.color.label} · {r.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Legend — one row per populated cohort, count desc, with exact count +
          est. units. Each row links to the same filtered segment view. */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Link
            key={r.cellKey}
            href={`${marketHref}/${r.segment}`}
            className="group flex items-center gap-2.5 border-b border-grid py-1.5"
          >
            <span
              className="h-2.5 w-2.5 flex-none rounded-sm"
              style={{ backgroundColor: r.color.fg }}
            />
            <span className="flex-1 truncate text-[13.5px] text-navy group-hover:text-teal">
              {r.color.label}
            </span>
            <span className="text-[13px] text-muted-foreground">
              <span className="dq-mono font-medium text-navy">
                {fmtInt(r.count)}
              </span>{" "}
              · ~{fmtInt(r.units)} units
            </span>
          </Link>
        ))}
      </div>

      {/* Standouts — the market's top-starred operators (gold-then-silver
          order), replacing the old denominator-less per-cohort star tallies. */}
      {standouts.length > 0 && (
        <div className="mt-6 border-t border-grid pt-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Market standouts
          </p>
          <div className="flex flex-wrap gap-2.5">
            {standouts.map((op) => {
              const color = QUADRANT7_COLORS[quadrant7Key(op.quadrant7Cell)];
              return (
                <Link
                  key={op.slug}
                  href={`${marketHref}/${op.slug}`}
                  className="group flex items-center gap-2 rounded-lg border border-grid bg-white px-3 py-1.5 transition-colors hover:border-teal/50"
                >
                  <span
                    className="h-2 w-2 flex-none rounded-sm"
                    style={{ backgroundColor: color.fg }}
                  />
                  <span className="text-[13.5px] font-medium text-navy group-hover:text-teal">
                    {op.name}
                  </span>
                  <span className="dq-mono text-[12.5px]">
                    <span style={{ color: "#d4a017" }}>★{op.goldCount}</span>{" "}
                    <span className="text-muted-2">☆{op.silverCount}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
