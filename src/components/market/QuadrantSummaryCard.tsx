import Link from "next/link";
import {
  QUADRANT7_COLORS,
  quadrant7Key,
  type Quadrant7CellKey,
} from "@/lib/quadrant7-colors";
import { fmtInt } from "@/lib/format";

// v0.6.5 — operator-landscape cohort tiles. Each tile is a gateway into its
// 7-cell segment (SFR / Small MF/BTR / Large MF/BTR × Independent /
// Institutional + Hybrid). The tile now answers "how big is this cohort and
// where are its standouts": operator count + summed observed units, then a
// gold-star-by-metric breakdown (Lease-up / Retention / Rent / Marketing).
// It replaces the prior cohort-median DOM + rent-vs-comp strip, which read as
// abstract now that the product leads with stars. Same Link affordance —
// each populated cell navigates to its filtered segment URL.

type Quadrant7CellStats = {
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

// Display order + labels for the gold-star-by-metric grid, keyed to
// goldByMetric. Short labels keep the 2×2 grid on a single line per cell.
const METRIC_ROWS: Array<{
  key: keyof Quadrant7CellStats["goldByMetric"];
  label: string;
}> = [
  { key: "leaseUp", label: "Lease-up" },
  { key: "retention", label: "Retention" },
  { key: "rent", label: "Rent" },
  { key: "marketing", label: "Marketing" },
];

// Canonical quadrant7Cell label → 7-cell color key. Mirrors the lookup in
// quadrant7-colors.ts (quadrant7Key) but keeps the map inline so the order
// across this component matches the tile-render order below.
const TILE_ORDER: Array<{
  cellKey: Quadrant7CellKey;
  canonicalLabel: string;
  segment: string;
}> = [
  {
    cellKey: "large-mfbtr-inst",
    canonicalLabel: "Large MF/BTR Institutional",
    segment: "large-mfbtr-institutional",
  },
  {
    cellKey: "large-mfbtr-ind",
    canonicalLabel: "Large MF/BTR Independent",
    segment: "large-mfbtr-independent",
  },
  {
    cellKey: "small-mfbtr-inst",
    canonicalLabel: "Small MF/BTR Institutional",
    segment: "small-mfbtr-institutional",
  },
  {
    cellKey: "small-mfbtr-ind",
    canonicalLabel: "Small MF/BTR Independent",
    segment: "small-mfbtr-independent",
  },
  {
    cellKey: "sfr-inst",
    canonicalLabel: "SFR Institutional",
    segment: "sfr-institutional",
  },
  {
    cellKey: "sfr-ind",
    canonicalLabel: "SFR Independent",
    segment: "sfr-independent",
  },
  {
    cellKey: "hybrid",
    canonicalLabel: "Hybrid",
    segment: "hybrid",
  },
];

// Format a signed percent value (already in % units) compactly: "+4.5%"
// for positive, "−3.2%" for negative (Unicode minus, never a hyphen), and
// "0.0%" for the exact zero edge case. Null renders as em-dash.
function fmtSignedPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n > 0) return `+${n.toFixed(1)}%`;
  if (n < 0) return `−${Math.abs(n).toFixed(1)}%`;
  return "0.0%";
}

function QuadrantTile({
  cellKey,
  canonicalLabel,
  segment,
  stats,
  marketHref,
}: {
  cellKey: Quadrant7CellKey;
  canonicalLabel: string;
  segment: string;
  stats: Quadrant7CellStats;
  marketHref: string;
}) {
  const color = QUADRANT7_COLORS[cellKey];
  const empty = stats.count === 0;
  const filterHref = `${marketHref}/${segment}`;

  const card = (
    <div
      className={
        "group flex h-full min-h-[200px] flex-col justify-between rounded-lg border border-grid bg-white p-5 transition-all duration-150 " +
        (empty
          ? "opacity-55"
          : "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(15_31_63_/_0.18),_0_2px_6px_rgb(15_31_63_/_0.06)]")
      }
    >
      <span
        className="dq-badge inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
        style={{ color: color.fg, backgroundColor: color.soft }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color.fg }}
        />
        {color.label}
      </span>

      <div className="mt-4 flex-1">
        <p className="dq-mono text-[36px] font-medium leading-none text-navy tracking-[-0.01em]">
          {fmtInt(stats.count)}
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {empty ? (
            "operators"
          ) : (
            <>
              operator{stats.count === 1 ? "" : "s"} · ~
              <span className="dq-mono not-italic">{fmtInt(stats.units)}</span>{" "}
              managed units (est.)
            </>
          )}
        </p>
        {empty ? (
          <p className="mt-4 text-[13px] italic text-muted-foreground">
            No operators in this segment yet.
          </p>
        ) : (
          // Gold-star-by-metric breakdown — how many operators in this cohort
          // earned a gold star on each of the four ranked-list metrics. A 2×2
          // grid keeps it compact; the star renders gold when the count is
          // non-zero, muted grey when zero, so a scan reads "where are the
          // standouts" at a glance.
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              Gold stars by metric
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {METRIC_ROWS.map(({ key, label }) => {
                const n = stats.goldByMetric[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <dt className="text-[12px] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="dq-mono flex items-center gap-1 text-[12.5px] font-medium text-navy">
                      <span
                        aria-hidden
                        style={{
                          color: n > 0 ? "#d4a017" : "#c3cad6",
                          fontSize: "11px",
                        }}
                      >
                        ★
                      </span>
                      {n}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
      </div>

      <p
        className={
          "mt-5 text-[13px] font-semibold " +
          (empty
            ? "text-muted-2"
            : "text-teal group-hover:text-teal-700 group-hover:underline")
        }
      >
        {empty ? "—" : "View operators →"}
      </p>
    </div>
  );

  if (empty) return card;
  return (
    <Link href={filterHref} aria-label={`View ${canonicalLabel} operators`}>
      {card}
    </Link>
  );
}

export function QuadrantSummaryCard({
  summary,
  marketHref,
}: {
  summary: Record<string, Quadrant7CellStats>;
  marketHref: string;
}) {
  return (
    // 7 tiles laid out as a 4-3 grid on lg, 2 cols on md, 1 col on mobile.
    // Hybrid lands in the last position so the 6 "type × scale" cells read
    // as a coherent block and Hybrid as a distinct trailing tile.
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TILE_ORDER.map(({ cellKey, canonicalLabel, segment }) => {
        const stats =
          summary[canonicalLabel] ??
          // Defensive — also try a key-name match in case upstream data
          // emitted a different casing or whitespace variant.
          Object.entries(summary).find(
            ([k]) => quadrant7Key(k) === cellKey
          )?.[1] ?? {
            count: 0,
            medianDomT12: null,
            medianRentVsComp: null,
            units: 0,
            goldByMetric: { leaseUp: 0, retention: 0, rent: 0, marketing: 0 },
          };
        return (
          <QuadrantTile
            key={cellKey}
            cellKey={cellKey}
            canonicalLabel={canonicalLabel}
            segment={segment}
            stats={stats}
            marketHref={marketHref}
          />
        );
      })}
    </div>
  );
}
