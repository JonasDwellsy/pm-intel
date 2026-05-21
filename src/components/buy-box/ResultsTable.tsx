"use client";

// Ranked results table for /buy-boxes/[id]/results. Client component
// so the user gets in-place column sorting + pagination without a
// round-trip to the server.
//
// Sortable columns: rank, operator, market, estimated portfolio,
// URUs T12, listing trajectory, concession rate, fit score. Default
// sort is fit score desc — the column header shows the active arrow.
//
// Pagination kicks in at 50 rows; smaller match sets render in full
// so the user doesn't see prev/next when they don't need to. 50/page
// keeps the table dense without falling off the bottom of typical
// desktop viewports.

import * as React from "react";
import Link from "next/link";
import { fmtInt, fmtPct } from "@/lib/format";
import type { ResultRowVM } from "@/lib/buy-box/results-view";
import { FitScoreBadge } from "./FitScoreBadge";

interface Props {
  rows: ResultRowVM[];
}

type SortKey =
  | "rank"
  | "name"
  | "market"
  | "estimatedPortfolio"
  | "urusT12"
  | "listingTrajectory"
  | "concessionRate"
  | "fitScore";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export function ResultsTable({ rows }: Props) {
  const [sortKey, setSortKey] = React.useState<SortKey>("fitScore");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [page, setPage] = React.useState(0);

  // Sort. Render-time sort + re-rank: when the user sorts by a non-rank
  // column, the rank column still mirrors the original fit-score-desc
  // ordering (rank #1 is always the best fit), and the displayed order
  // changes. That matches institutional-table convention — rank is a
  // permanent identifier, not the visual order.
  const sorted = React.useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      const cmp = compareForKey(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const needsPagination = rows.length > PAGE_SIZE;
  const pageCount = needsPagination ? Math.ceil(sorted.length / PAGE_SIZE) : 1;
  const pageStart = page * PAGE_SIZE;
  const pageEnd = needsPagination ? pageStart + PAGE_SIZE : sorted.length;
  const visible = needsPagination ? sorted.slice(pageStart, pageEnd) : sorted;

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction picked per column — bigger-is-better columns
      // descend first, name/market ascend first.
      setSortDir(key === "name" || key === "market" ? "asc" : "desc");
    }
    setPage(0);
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto rounded-lg border border-grid bg-white">
        <table className="dq-table w-full min-w-[1100px]">
          <thead>
            <tr>
              <SortableTh sortKey={sortKey} sortDir={sortDir} thisKey="rank" onClick={() => toggleSort("rank")} className="w-12 text-right">
                #
              </SortableTh>
              <SortableTh sortKey={sortKey} sortDir={sortDir} thisKey="name" onClick={() => toggleSort("name")}>
                Operator
              </SortableTh>
              <SortableTh sortKey={sortKey} sortDir={sortDir} thisKey="market" onClick={() => toggleSort("market")}>
                Market
              </SortableTh>
              <th>7-Cell</th>
              <SortableTh
                sortKey={sortKey}
                sortDir={sortDir}
                thisKey="estimatedPortfolio"
                onClick={() => toggleSort("estimatedPortfolio")}
                className="text-right"
              >
                Est. Portfolio
              </SortableTh>
              <SortableTh
                sortKey={sortKey}
                sortDir={sortDir}
                thisKey="urusT12"
                onClick={() => toggleSort("urusT12")}
                className="text-right"
              >
                URUs T12
              </SortableTh>
              <SortableTh
                sortKey={sortKey}
                sortDir={sortDir}
                thisKey="listingTrajectory"
                onClick={() => toggleSort("listingTrajectory")}
                className="text-right"
              >
                Listing YoY
              </SortableTh>
              <SortableTh
                sortKey={sortKey}
                sortDir={sortDir}
                thisKey="concessionRate"
                onClick={() => toggleSort("concessionRate")}
                className="text-right"
              >
                Concession
              </SortableTh>
              <SortableTh
                sortKey={sortKey}
                sortDir={sortDir}
                thisKey="fitScore"
                onClick={() => toggleSort("fitScore")}
                className="text-right"
              >
                Fit Score
              </SortableTh>
              <th className="text-right">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.pmSlug}-${row.marketId}`}>
                <td className="dq-mono text-right text-muted-foreground tabular-nums">
                  {row.rank}
                </td>
                <td>
                  <div className="font-semibold text-navy">{row.name}</div>
                  {row.isMultiMarket && (
                    <span className="dq-pill dq-pill-navy-soft mt-1 inline-block text-[10.5px]">
                      Multi-market · {row.marketCount}
                    </span>
                  )}
                </td>
                <td className="text-[13px] text-foreground/80">
                  {row.marketName}
                </td>
                <td className="text-[12.5px] text-foreground/80">
                  {row.quadrant7Cell ?? <span className="text-muted-2">—</span>}
                </td>
                <td className="text-right" title={portfolioRangeTitle(row)}>
                  <span className="dq-mono tabular-nums text-navy">
                    {fmtInt(row.estimatedPortfolioPoint)}
                  </span>
                  {row.estimatedPortfolioLow !== null &&
                    row.estimatedPortfolioHigh !== null && (
                      <div className="dq-mono text-[10.5px] text-muted-foreground tabular-nums">
                        {fmtInt(row.estimatedPortfolioLow)}–
                        {fmtInt(row.estimatedPortfolioHigh)}
                      </div>
                    )}
                </td>
                <td className="dq-mono text-right tabular-nums">
                  {fmtInt(row.urusT12)}
                </td>
                <td
                  className={
                    "dq-mono text-right tabular-nums " +
                    yoyClass(row.listingTrajectoryYoY)
                  }
                >
                  {row.listingTrajectoryYoY === null
                    ? "—"
                    : fmtPct(row.listingTrajectoryYoY * 100, 0, true)}
                </td>
                <td className="dq-mono text-right tabular-nums">
                  {row.concessionRate === null
                    ? "—"
                    : fmtPct(row.concessionRate * 100, 1)}
                </td>
                <td className="text-right">
                  <FitScoreBadge
                    fitScore={row.fitScore}
                    operatorName={row.name}
                    preferred={row.preferredBreakdown}
                    required={row.requiredBreakdown}
                    excluded={row.excludedBreakdown}
                    preferredPassedCount={row.preferredPassedCount}
                    preferredTotalCount={row.preferredTotalCount}
                  />
                </td>
                <td className="text-right">
                  <Link
                    href={row.scorecardHref}
                    className="inline-flex h-7 items-center rounded-md border border-grid bg-white px-2.5 text-[12px] font-medium text-teal hover:border-teal hover:text-teal-700"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {needsPagination && (
        <div className="mt-4 flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            Showing{" "}
            <span className="dq-mono tabular-nums text-navy">
              {pageStart + 1}–{Math.min(pageEnd, sorted.length)}
            </span>{" "}
            of{" "}
            <span className="dq-mono tabular-nums text-navy">
              {sorted.length}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 rounded-md border border-grid bg-white px-3 text-[12.5px] font-medium text-navy hover:bg-surface-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="dq-mono text-[11.5px] text-muted-foreground tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="h-8 rounded-md border border-grid bg-white px-3 text-[12.5px] font-medium text-navy hover:bg-surface-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────

function SortableTh({
  children,
  thisKey,
  sortKey,
  sortDir,
  onClick,
  className,
}: {
  children: React.ReactNode;
  thisKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const active = sortKey === thisKey;
  return (
    <th
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-inherit hover:opacity-90"
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={
            "text-[9px] " + (active ? "opacity-90" : "opacity-30")
          }
        >
          {active ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
  );
}

function compareForKey(a: ResultRowVM, b: ResultRowVM, key: SortKey): number {
  switch (key) {
    case "rank":
      return a.rank - b.rank;
    case "name":
      return a.name.localeCompare(b.name);
    case "market":
      return a.marketName.localeCompare(b.marketName);
    case "estimatedPortfolio":
      return numCmp(a.estimatedPortfolioPoint, b.estimatedPortfolioPoint);
    case "urusT12":
      return numCmp(a.urusT12, b.urusT12);
    case "listingTrajectory":
      return numCmp(a.listingTrajectoryYoY, b.listingTrajectoryYoY);
    case "concessionRate":
      return numCmp(a.concessionRate, b.concessionRate);
    case "fitScore":
      return a.fitScore - b.fitScore;
    default:
      return 0;
  }
}

/** Stable numeric compare that pushes nulls to the bottom regardless of
 *  sort direction (so "—" doesn't dominate the top when sorted desc). */
function numCmp(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1; // a is "lower" → when desc-sorted, ends up at the bottom
  if (b === null) return 1;
  return a - b;
}

function yoyClass(v: number | null): string {
  if (v === null) return "text-muted-2";
  if (v > 0.01) return "text-good";
  if (v < -0.01) return "text-bad";
  return "text-foreground/80";
}

function portfolioRangeTitle(row: ResultRowVM): string {
  if (row.estimatedPortfolioPoint === null) return "No portfolio estimate";
  if (row.estimatedPortfolioLow === null || row.estimatedPortfolioHigh === null)
    return `Point estimate: ${row.estimatedPortfolioPoint} units`;
  return `Range: ${row.estimatedPortfolioLow}–${row.estimatedPortfolioHigh} units${
    row.estimatedPortfolioConfidence
      ? ` (${row.estimatedPortfolioConfidence} confidence)`
      : ""
  }`;
}
