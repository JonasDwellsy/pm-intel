"use client";

// Scorecard redesign — Properties section (05).
// Renders the Phase 1 property-level detail: descriptive observations +
// MSA-median comps per property (MF community or scattered-SFR submarket
// rollup) — deliberately UN-scored (no per-property star/percentile/rank;
// see property-detail-view.ts's module docstring). Client component only
// because the table is sortable; the data itself is server-provided via
// `scorecard.propertyDetail`.

import * as React from "react";
import type { ScorecardData } from "@/lib/types";
import {
  projectPropertyRows,
  type ComparableCell,
  type PropertyRowVM,
} from "@/lib/scorecard/property-detail-view";
import { fmtInt, fmtPct } from "@/lib/format";
import { PropertyExportButton } from "@/components/scorecard/PropertyExportButton";

type SortKey =
  | "label"
  | "size"
  | "nListings"
  | "dom"
  | "rent"
  | "concession"
  | "quality";
type SortDir = "asc" | "desc";

// ─── formatters ───────────────────────────────────────────────────────────

function fmtRentValue(n: number): string {
  return `$${fmtInt(n)}`;
}
function fmtDomValueNum(n: number): string {
  return fmtInt(Math.round(n));
}
function fmtConcessionValue(n: number): string {
  return fmtPct(n * 100, 0);
}
function fmtRentYoyValue(n: number): string {
  return fmtPct(n * 100, 1, true);
}

// ─── sort helpers ─────────────────────────────────────────────────────────

/** MF community → units; scattered-SFR submarket → homes. Missing → -1 so
 *  unsized rows sort to one end consistently rather than interleaving. */
function sizeOf(row: PropertyRowVM): number {
  return (row.kind === "community" ? row.units : row.homes) ?? -1;
}

function displayLabel(row: PropertyRowVM): string {
  // Scattered-SFR rows are submarket rollups, not individual properties —
  // the label makes that explicit rather than reading as a single address.
  return row.kind === "sfr-submarket"
    ? `SFR · ${row.submarket ?? row.label}`
    : row.label;
}

function compareRows(a: PropertyRowVM, b: PropertyRowVM, key: SortKey): number {
  switch (key) {
    case "label":
      return displayLabel(a).localeCompare(displayLabel(b));
    case "size":
      return sizeOf(a) - sizeOf(b);
    case "nListings":
      return a.nListings - b.nListings;
    case "dom":
      return (
        (a.medianDomT12.value ?? Number.POSITIVE_INFINITY) -
        (b.medianDomT12.value ?? Number.POSITIVE_INFINITY)
      );
    case "rent":
      return (
        (a.medianRentT12.value ?? Number.NEGATIVE_INFINITY) -
        (b.medianRentT12.value ?? Number.NEGATIVE_INFINITY)
      );
    case "concession":
      return (
        (a.concessionRate.value ?? Number.NEGATIVE_INFINITY) -
        (b.concessionRate.value ?? Number.NEGATIVE_INFINITY)
      );
    case "quality":
      return (
        (a.listingQuality ?? Number.NEGATIVE_INFINITY) -
        (b.listingQuality ?? Number.NEGATIVE_INFINITY)
      );
    default:
      return 0;
  }
}

// ─── cell rendering ───────────────────────────────────────────────────────

/** A comparable metric cell: the operator value, tone-colored by
 *  deltaSign, followed by the MSA-median comp inline (e.g. "22 · mkt 29").
 *  Never colors on a `null` or `"neutral"` deltaSign — only "better"/
 *  "worse" carry a tone, and even then it's a subtle color shift, not a
 *  badge/star/rank. */
function ComparableValue({
  cell,
  format,
}: {
  cell: ComparableCell;
  format: (n: number) => string;
}) {
  if (cell.value == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const toneClass =
    cell.deltaSign === "better"
      ? "text-good"
      : cell.deltaSign === "worse"
        ? "text-bad"
        : "text-foreground";
  return (
    <span className="whitespace-nowrap">
      <span className={`${toneClass} font-medium`}>{format(cell.value)}</span>
      {cell.comp != null && (
        <span className="ml-1 text-[11.5px] text-muted-foreground">
          · mkt {format(cell.comp)}
        </span>
      )}
    </span>
  );
}

interface ColDef {
  id: string;
  label: string;
  sortKey: SortKey | null;
  alignRight?: boolean;
}

const COLUMNS: ColDef[] = [
  { id: "label", label: "Property / Community", sortKey: "label" },
  { id: "size", label: "Units / Homes", sortKey: "size", alignRight: true },
  { id: "nListings", label: "N Listings", sortKey: "nListings", alignRight: true },
  { id: "dom", label: "Median DOM", sortKey: "dom", alignRight: true },
  { id: "rent", label: "Rent + YoY", sortKey: "rent", alignRight: true },
  { id: "concession", label: "Concession %", sortKey: "concession", alignRight: true },
  { id: "quality", label: "Listing Quality", sortKey: "quality", alignRight: true },
];

function SortableHeaderCell({
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  col: ColDef;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = col.sortKey !== null && col.sortKey === sortKey;
  return (
    <th
      className={col.alignRight ? "num" : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {col.sortKey ? (
        <button
          type="button"
          onClick={() => onSort(col.sortKey!)}
          className="inline-flex items-center gap-1 text-inherit hover:opacity-90"
        >
          <span>{col.label}</span>
          <span aria-hidden className={"text-[9px] " + (active ? "opacity-90" : "opacity-40")}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
          </span>
        </button>
      ) : (
        col.label
      )}
    </th>
  );
}

function PropertyRow({ row }: { row: PropertyRowVM }) {
  return (
    <tr>
      <td>{displayLabel(row)}</td>
      <td className="num">
        {row.kind === "community"
          ? row.units != null
            ? `${fmtInt(row.units)} units`
            : "—"
          : row.homes != null
            ? `${fmtInt(row.homes)} homes`
            : "—"}
      </td>
      <td className="num">{fmtInt(row.nListings)}</td>
      <td className="num">
        <ComparableValue cell={row.medianDomT12} format={fmtDomValueNum} />
      </td>
      <td className="num">
        <div>
          <ComparableValue cell={row.medianRentT12} format={fmtRentValue} />
        </div>
        <div className="mt-0.5">
          <ComparableValue cell={row.rentYoY} format={fmtRentYoyValue} />
        </div>
      </td>
      <td className="num">
        <ComparableValue cell={row.concessionRate} format={fmtConcessionValue} />
      </td>
      <td className="num">
        {row.listingQuality != null ? fmtInt(Math.round(row.listingQuality)) : "—"}
      </td>
    </tr>
  );
}

// ─── section ──────────────────────────────────────────────────────────────

export function PropertyDetailSection({
  scorecard,
  publicSample = false,
}: {
  scorecard: ScorecardData;
  /** When true (the public /sample page), the export control hides — it has
   *  no gated identity to attach a download to, mirroring how the header's
   *  Copy-link/Download-PDF affordances hide on the public sample. The table
   *  of observations itself still renders (same treatment as every other
   *  metric section on /sample). Defaults to false. */
  publicSample?: boolean;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("nListings");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const rows = React.useMemo(() => {
    const block = scorecard.propertyDetail;
    if (!block) return [];
    return projectPropertyRows(block);
  }, [scorecard.propertyDetail]);

  const sorted = React.useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => sortDir === "asc" ? compareRows(a, b, sortKey) : -compareRows(a, b, sortKey));
    return arr;
  }, [rows, sortKey, sortDir]);

  // Columns where the "better" direction is the smaller number sort smallest-
  // first on the initial click (fastest lease-up / fewest concessions
  // surfaces first); the rest default biggest-first, matching ResultsTable's
  // convention elsewhere on the scorecard. Label sorts A→Z.
  const ASCENDING_FIRST: SortKey[] = ["label", "dom", "concession"];

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(ASCENDING_FIRST.includes(key) ? "asc" : "desc");
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      id="properties"
      className="dq-section"
      style={{ borderTop: "2px solid #eef1f6", padding: "20px 0 6px" }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        <span style={{ fontSize: "11px", color: "#aab3c6", fontWeight: 700 }}>05</span>
        <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f1f3f" }}>
          Properties
        </span>
        <span style={{ flex: 1 }} />
        {!publicSample && <PropertyExportButton slug={scorecard.pm.slug} />}
      </div>

      {/* Plain-English intro */}
      <p
        style={{
          fontSize: "12.5px",
          color: "#5b6577",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        Per-property observations vs. the MSA median — descriptive, not
        scored. Scattered single-family holdings are grouped into submarket
        rollups rather than shown per address.
      </p>

      <div className="overflow-x-auto rounded-lg border border-grid bg-white">
        <table className="dq-table w-full">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <SortableHeaderCell
                  key={col.id}
                  col={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <PropertyRow key={`${row.kind}-${row.label}-${i}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
