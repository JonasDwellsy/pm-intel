"use client";

// v0.9 — Ranked results table with operator-level rollup as the
// default view.
//
// The table accepts BOTH projections from results-view (per-market
// + per-operator) and switches between them via the "Operator view"
// / "Market view" toggle in the table header. Toggle state lives in
// localStorage so the user's choice persists across sessions and
// watch lists.
//
// Columns are adaptive:
//   Always-on (in this order):
//     #, Operator, Market, 7-cell, Est. Portfolio, URUs T12,
//     Fit Score, View →
//   Adaptive (appended in watch-list criterion order, deduped against
//   the always-on set):
//     1 column per criterion in required / preferred / excluded.
//
// Column headers show a (?) tooltip with the field description on
// hover (or tap on touch), reusing the same FieldInfo component
// the editor uses for criterion rows so the description copy stays
// in sync as a single source of truth.
//
// View → button on rolled-up multi-market rows opens a market
// picker popover (since the v0.9 operator scorecard page doesn't
// exist yet). Single-market or per-market rows drill straight
// through to the existing scorecard URL.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtInt, fmtPct, fmtNumber } from "@/lib/format";
import {
  FIELD_REGISTRY,
  type FilterCriterion,
  type WeightedCriterion,
} from "@/lib/watch-list/fields";
import type { ResultRowVM, DrillTarget } from "@/lib/watch-list/results-view";
import { ALWAYS_ON_FIELD_IDS } from "@/lib/watch-list/adaptive-columns";
import { FitScoreBadge } from "./FitScoreBadge";

interface Props {
  operatorRows: ResultRowVM[];
  marketRows: ResultRowVM[];
  /** Watch list criteria drive the adaptive-column list. Order is
   *  required → preferred → excluded so the most-important columns
   *  surface first. */
  required: FilterCriterion[];
  preferred: WeightedCriterion[];
  excluded: FilterCriterion[];
  /** v0.28 (Task 7) — needed by the remove-pin control to know which
   *  list's membership to mutate. Always the current watch list's id;
   *  unused when canManageMembers is false. */
  watchListId: string;
  /** True on ANY editable watch list's results, for the owner (or a
   *  legacy-owner-in-org) — i.e. `canEditList(...)`, resolved by the
   *  page. Gates the per-row "Remove" control; a view-only shared
   *  viewer never sees it. The per-row `render` further guards on
   *  `row.pinned`, so a match-only row (no pin) never gets a remove
   *  button even on an editable list. Defaults to false so every
   *  other caller is unaffected. */
  canManageMembers?: boolean;
}

type ViewMode = "operator" | "market";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;
const TOGGLE_STORAGE_KEY = "watch-list:results-view";

// ALWAYS_ON_FIELD_IDS moved to src/lib/watch-list/adaptive-columns.ts
// in PR #49 so the v0.12 Excel export can share the same dedup
// set. The import above brings it back into local scope.

interface ColumnDef {
  id: string;
  label: string;
  /** Field id when this column maps to a registry entry — drives
   *  the (?) tooltip content. Null for always-on columns that don't
   *  correspond to a single field (#, Operator, View). */
  fieldId: string | null;
  /** Fallback tooltip when fieldId is null. */
  tooltip?: string;
  /** Sort key — null = not sortable. */
  sortKey: string | null;
  /** Right-aligned (numeric / score). */
  alignRight?: boolean;
  /** CSS class that freezes this column during horizontal scroll
   *  (wl-col-rank / wl-col-name — see globals.css). */
  stickyClass?: string;
  /** Fixed column width in px. Required on sticky columns so the
   *  `left` offsets in globals.css line up. */
  width?: number;
  render: (row: ResultRowVM) => React.ReactNode;
}

export function ResultsTable({
  operatorRows,
  marketRows,
  required,
  preferred,
  excluded,
  watchListId,
  canManageMembers = false,
}: Props) {
  // ── View toggle (Operator / Market) with localStorage persistence.
  // Server-render value is "operator" (the spec default). Client
  // hydrates with the same value (avoiding a hydration mismatch),
  // then this effect reads the stored preference and overrides it
  // on the next render. This is the canonical SSR-safe persisted-
  // state pattern; the eslint rule is over-broad here.
  const [view, setView] = React.useState<ViewMode>("operator");
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TOGGLE_STORAGE_KEY);
      if (stored === "operator" || stored === "market") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setView(stored);
      }
    } catch {
      // localStorage can throw under quota / private-mode; ignore.
    }
  }, []);
  function changeView(v: ViewMode) {
    setView(v);
    setPage(0);
    setSortKey("fitScore");
    setSortDir("desc");
    try {
      window.localStorage.setItem(TOGGLE_STORAGE_KEY, v);
    } catch {
      // Persist failure is non-blocking.
    }
  }

  const [sortKey, setSortKey] = React.useState<string>("fitScore");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [page, setPage] = React.useState(0);

  const activeRows = view === "operator" ? operatorRows : marketRows;

  // Build the column list adaptively.
  const columns: ColumnDef[] = React.useMemo(
    () => buildColumns({ required, preferred, excluded, watchListId, canManageMembers }),
    [required, preferred, excluded, watchListId, canManageMembers]
  );

  // Sort.
  const sorted = React.useMemo(() => {
    const arr = activeRows.slice();
    arr.sort((a, b) => {
      const cmp = compareForKey(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [activeRows, sortKey, sortDir]);

  const needsPagination = sorted.length > PAGE_SIZE;
  const pageCount = needsPagination ? Math.ceil(sorted.length / PAGE_SIZE) : 1;
  const pageStart = page * PAGE_SIZE;
  const pageEnd = needsPagination ? pageStart + PAGE_SIZE : sorted.length;
  const visible = needsPagination ? sorted.slice(pageStart, pageEnd) : sorted;

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Bigger-is-better defaults descend; string-y columns ascend.
      setSortDir(
        key === "name" || key === "market" || key === "quadrant7Cell"
          ? "asc"
          : "desc"
      );
    }
    setPage(0);
  }

  // Horizontal-scroll plumbing: a synced scrollbar strip ABOVE the table so
  // the wide metric grid can be scrolled right without hunting for the
  // scrollbar at the bottom of a tall table. topScrollRef ↔ bodyScrollRef
  // mirror each other's scrollLeft; scrollW sizes the top strip's spacer to
  // the table's full width so its scrollbar tracks the body's.
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = React.useState(0);
  React.useEffect(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    const measure = () => setScrollW(el.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, columns, view]);
  function syncScroll(from: "top" | "body") {
    const top = topScrollRef.current;
    const body = bodyScrollRef.current;
    if (!top || !body) return;
    if (from === "top") body.scrollLeft = top.scrollLeft;
    else top.scrollLeft = body.scrollLeft;
  }

  return (
    <div className="mt-6">
      {/* Toggle + a caption that spells out what each view does (the
          operator↔market difference is otherwise easy to miss when most
          operators are single-market). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle value={view} onChange={changeView} />
          <span className="text-[12px] text-muted-foreground">
            {view === "operator"
              ? "One row per operator — multi-market operators rolled up."
              : "One row per operator × market — multi-market operators split out."}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground">
          {view === "operator"
            ? `${operatorRows.length} operator${operatorRows.length === 1 ? "" : "s"}`
            : `${marketRows.length} market row${marketRows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Top horizontal scrollbar, synced with the table body so the wide
          grid is scrollable from the top of a tall table. */}
      <div
        ref={topScrollRef}
        onScroll={() => syncScroll("top")}
        className="mt-4 overflow-x-auto"
        aria-hidden
      >
        <div style={{ width: scrollW, height: 1 }} />
      </div>

      <div
        ref={bodyScrollRef}
        onScroll={() => syncScroll("body")}
        className="mt-1 overflow-x-auto rounded-lg border border-grid bg-white"
      >
        <table className="dq-table w-full min-w-[1100px]">
          <thead>
            <tr>
              {columns.map((col) => (
                <SortableTh
                  key={col.id}
                  col={col}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={() => col.sortKey && toggleSort(col.sortKey)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={
                      [col.alignRight ? "text-right" : "", col.stickyClass ?? ""]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    style={
                      col.width
                        ? { width: col.width, minWidth: col.width }
                        : undefined
                    }
                  >
                    {col.render(row)}
                  </td>
                ))}
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

// ─── view toggle ──────────────────────────────────────────────────

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Result view mode"
      className="inline-flex rounded-md border border-grid bg-white p-0.5"
    >
      {(["operator", "market"] as ViewMode[]).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={
              "px-3 py-1 text-[12.5px] font-medium rounded transition-colors " +
              (active
                ? "bg-navy text-white"
                : "bg-transparent text-navy hover:bg-surface-soft")
            }
          >
            {opt === "operator" ? "Operator view" : "Market view"}
          </button>
        );
      })}
    </div>
  );
}

// ─── pinned / matched badge ───────────────────────────────────────

/** The "Pinned" / "Pinned + matches" pill shown next to a row's name
 *  when it was manually pinned to the watch list. `matched` (also
 *  true) means the row independently passes the list's criteria —
 *  pulled into its own component so it's the exact unit under test
 *  in ResultsTable.test.tsx, without needing a full ResultRowVM
 *  fixture. */
export function PinnedMatchBadge({
  pinned,
  matched,
}: {
  pinned: boolean;
  matched?: boolean;
}) {
  if (!pinned) return null;
  return (
    <span
      className="dq-pill dq-pill-teal text-[10.5px]"
      title={
        matched
          ? "Manually pinned; also matches this list's criteria."
          : "Manually pinned to this watch list."
      }
    >
      {matched ? "Pinned + matches" : "Pinned"}
    </span>
  );
}

// ─── column builder ───────────────────────────────────────────────

function buildColumns({
  required,
  preferred,
  excluded,
  watchListId,
  canManageMembers,
}: {
  required: FilterCriterion[];
  preferred: WeightedCriterion[];
  excluded: FilterCriterion[];
  watchListId: string;
  canManageMembers: boolean;
}): ColumnDef[] {
  const cols: ColumnDef[] = [
    {
      id: "rank",
      label: "#",
      fieldId: null,
      tooltip: "Rank within the watch list. 1 = highest fit score.",
      sortKey: "rank",
      alignRight: true,
      stickyClass: "wl-col-rank",
      width: 60,
      render: (row) => (
        <span className="dq-mono text-muted-foreground tabular-nums">
          {row.rank}
        </span>
      ),
    },
    {
      id: "name",
      label: "Operator",
      fieldId: "name",
      sortKey: "name",
      stickyClass: "wl-col-name",
      width: 240,
      render: (row) => (
        <div>
          <div className="font-semibold text-navy">{row.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {row.isMultiMarket && (
              <span className="dq-pill dq-pill-navy-soft inline-block text-[10.5px]">
                Multi-market · {row.marketCount}
              </span>
            )}
            <PinnedMatchBadge pinned={row.pinned} matched={row.matched} />
          </div>
        </div>
      ),
    },
    {
      id: "market",
      label: "Market",
      fieldId: "marketIds",
      sortKey: "market",
      render: (row) => (
        <span className="text-[13px] text-foreground/80">{row.marketLabel}</span>
      ),
    },
    {
      id: "quadrant7Cell",
      label: "7-Cell",
      fieldId: "quadrant7Cell",
      sortKey: "quadrant7Cell",
      render: (row) => (
        <span className="text-[12.5px] text-foreground/80">
          {row.quadrant7Cell ?? <span className="text-muted-2">—</span>}
          {row.quadrant7CellIsMixed && (
            <span
              title="Member markets disagree — showing the modal value."
              className="ml-1.5 inline-block rounded-full bg-orange-soft px-1.5 py-0.5 align-middle text-[9.5px] font-semibold text-orange-700 uppercase tracking-wider"
            >
              mixed
            </span>
          )}
        </span>
      ),
    },
    {
      id: "estimatedPortfolio",
      label: "Est. Portfolio",
      fieldId: "estimatedPortfolioPoint",
      sortKey: "estimatedPortfolio",
      alignRight: true,
      render: (row) => (
        <>
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
        </>
      ),
    },
    {
      id: "urusT12",
      label: "URUs T12",
      fieldId: "urusT12",
      sortKey: "urusT12",
      alignRight: true,
      render: (row) => (
        <span className="dq-mono tabular-nums">{fmtInt(row.urusT12)}</span>
      ),
    },
  ];

  // Append adaptive columns — one per criterion field, deduped.
  // Order: required → preferred → excluded so the most decisive
  // columns surface first.
  const seen = new Set<string>(ALWAYS_ON_FIELD_IDS);
  const allCriteria: Array<{ field: string }> = [
    ...required,
    ...preferred,
    ...excluded,
  ];
  for (const c of allCriteria) {
    if (seen.has(c.field)) continue;
    seen.add(c.field);
    const entry = FIELD_REGISTRY[c.field];
    if (!entry) continue;
    cols.push({
      id: `criterion-${c.field}`,
      label: entry.label,
      fieldId: c.field,
      sortKey: `criterion-${c.field}`,
      alignRight: entry.type === "number" || entry.type === "boolean",
      render: (row) => renderCriterionCell(row, c.field),
    });
  }

  // Fit score + View at the end so adaptive columns sit between
  // them and the always-on left-side group.
  cols.push({
    id: "fitScore",
    label: "Fit Score",
    fieldId: null,
    tooltip:
      "0–100 score derived from the weighted preferred criteria. Click a chip for the breakdown.",
    sortKey: "fitScore",
    alignRight: true,
    render: (row) => (
      <FitScoreBadge
        fitScore={row.fitScore}
        operatorName={row.name}
        preferred={row.preferredBreakdown}
        required={row.requiredBreakdown}
        excluded={row.excludedBreakdown}
        preferredPassedCount={row.preferredPassedCount}
        preferredTotalCount={row.preferredTotalCount}
      />
    ),
  });
  cols.push({
    id: "view",
    label: "",
    fieldId: null,
    tooltip: "Open the operator scorecard.",
    sortKey: null,
    alignRight: true,
    render: (row) => <ViewButton row={row} />,
  });
  // v0.28 (Task 7 Step 2; widened by the hybrid-watch-lists work) —
  // owner-only manage/remove on ANY editable list's results (owner,
  // or legacy-owned-in-org — the same `canEditList(...)` rule every
  // other mutation in this module uses). Not gated to `kind`
  // anymore: a hybrid list can carry both criteria matches and
  // manual pins, and pin-management should show wherever pins can
  // exist. The per-row `row.pinned ?` guard below means a match-only
  // row (no pin) still renders no remove button, and a view-only
  // shared viewer never gets this column at all.
  if (canManageMembers) {
    cols.push({
      id: "managePin",
      label: "",
      fieldId: null,
      tooltip: "Remove this company from the watch list.",
      sortKey: null,
      alignRight: true,
      render: (row) =>
        row.pinned ? (
          <RemovePinButton
            watchListId={watchListId}
            memberKey={row.memberKey}
            operatorName={row.name}
          />
        ) : null,
    });
  }
  return cols;
}

function renderCriterionCell(row: ResultRowVM, fieldId: string): React.ReactNode {
  const entry = FIELD_REGISTRY[fieldId];
  if (!entry) return <span className="text-muted-2">—</span>;
  const raw = entry.getValueFromPM(row.pm);
  if (raw === null || raw === undefined) return <span className="text-muted-2">—</span>;
  if (entry.type === "boolean") {
    return (
      <span className="dq-mono text-[12.5px] tabular-nums">
        {raw ? "yes" : "no"}
      </span>
    );
  }
  if (entry.type === "number") {
    if (typeof raw !== "number") return String(raw);
    // Decimal-percent fields (0..1 stored) → display as percent.
    if (
      fieldId === "concessionRate" ||
      fieldId === "listingTrajectoryYoY" ||
      fieldId === "rentPerformanceYoY"
    ) {
      const cls =
        fieldId === "listingTrajectoryYoY" || fieldId === "rentPerformanceYoY"
          ? raw > 0.01
            ? "text-good"
            : raw < -0.01
            ? "text-bad"
            : "text-foreground/80"
          : "";
      return (
        <span className={`dq-mono tabular-nums ${cls}`}>
          {fmtPct(raw * 100, 1, fieldId === "listingTrajectoryYoY" || fieldId === "rentPerformanceYoY")}
        </span>
      );
    }
    if (fieldId === "topCityConcentration") {
      return (
        <span className="dq-mono tabular-nums">{fmtPct(raw, 1)}</span>
      );
    }
    // Whole-unit count-ish fields render as integers.
    if (
      fieldId === "monthsOnPlatform" ||
      fieldId === "daysOnMarketT12" ||
      fieldId === "marketCount"
    ) {
      return <span className="dq-mono tabular-nums">{fmtInt(raw)}</span>;
    }
    return <span className="dq-mono tabular-nums">{fmtNumber(raw, 1)}</span>;
  }
  if (Array.isArray(raw)) return <span className="text-[12.5px]">{raw.join(", ")}</span>;
  return <span className="text-[12.5px] text-foreground/80">{String(raw)}</span>;
}

// ─── view / drill-through ─────────────────────────────────────────

function ViewButton({ row }: { row: ResultRowVM }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Single-market or per-market row → direct link.
  if (row.drillTargets.length <= 1) {
    const t = row.drillTargets[0];
    if (!t) return null;
    return (
      <Link
        href={t.href}
        className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-grid bg-white px-2.5 text-[12px] font-medium text-teal hover:border-teal hover:text-teal-700"
      >
        View →
      </Link>
    );
  }

  // Multi-market rollup → picker popover.
  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-grid bg-white px-2.5 text-[12px] font-medium text-teal hover:border-teal hover:text-teal-700"
      >
        View →
      </button>
      {open && (
        <span
          role="menu"
          className="absolute right-0 top-8 z-30 w-[260px] rounded-lg border border-grid bg-white p-2 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* v0.11 — operator scorecard as primary action for
              multi-market rollups; per-market links secondary. */}
          {row.operatorScorecardHref && (
            <>
              <Link
                href={row.operatorScorecardHref}
                role="menuitem"
                className="block rounded-md bg-teal px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-teal-700"
              >
                View operator scorecard →
              </Link>
              <span className="my-2 block h-px bg-grid" />
            </>
          )}
          <span className="block px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Or jump to a market:
          </span>
          <span className="block max-h-[240px] overflow-y-auto">
            {row.drillTargets.map((t) => (
              <DrillLink key={t.marketId} t={t} />
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

function DrillLink({ t }: { t: DrillTarget }) {
  return (
    <Link
      href={t.href}
      className="block rounded-md px-2 py-1.5 text-[12.5px] text-navy hover:bg-teal-soft hover:text-teal-700"
      role="menuitem"
    >
      {t.marketShort}
      <span className="ml-2 text-[10.5px] text-muted-foreground">
        {t.marketName}
      </span>
    </Link>
  );
}

// ─── manage/remove (Task 7 Step 2) ─────────────────────────────────

/** Owner-only unpin control on a watch list's results. Calls DELETE
 *  /api/watch-lists/[id]/members with the row's company-level
 *  memberKey, then router.refresh() so the server re-runs
 *  applyWatchList/listMembers and the row naturally disappears from
 *  the next render — no local row-removal bookkeeping needed here.
 *  No confirm dialog: unpinning isn't destructive the way deleting a
 *  whole list is (WatchListIndex's delete DOES confirm) — a mis-click
 *  is trivially reversible via the "Watch list" control on the
 *  operator's scorecard/market/search row. */
function RemovePinButton({
  watchListId,
  memberKey,
  operatorName,
}: {
  watchListId: string;
  memberKey: string;
  operatorName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRemove() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/watch-lists/${watchListId}/members`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberKey }),
      });
      if (!res.ok) throw new Error(`Failed to remove (${res.status}).`);
      router.refresh();
      // Deliberately leave `pending` true — the button stays disabled
      // (reading "Removing…") until the refreshed server render swaps
      // this row out, avoiding a flash back to "Remove" right before
      // the row disappears.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove.");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => void handleRemove()}
        disabled={pending}
        aria-label={`Remove ${operatorName} from this watch list`}
        className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-grid bg-white px-2.5 text-[12px] font-medium text-muted-foreground hover:border-bad hover:text-bad disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && (
        <span role="alert" className="text-[10.5px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

// ─── sortable header with tooltip ─────────────────────────────────

function SortableTh({
  col,
  sortKey,
  sortDir,
  onClick,
}: {
  col: ColumnDef;
  sortKey: string;
  sortDir: SortDir;
  onClick: () => void;
}) {
  const active = col.sortKey !== null && sortKey === col.sortKey;
  const sortable = col.sortKey !== null;
  return (
    <th
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
      className={
        [col.alignRight ? "text-right" : "", col.stickyClass ?? ""]
          .filter(Boolean)
          .join(" ") || undefined
      }
      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
    >
      <span className="inline-flex items-center gap-1.5">
        {sortable ? (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1 text-inherit hover:opacity-90"
          >
            <span>{col.label}</span>
            <span
              aria-hidden
              className={
                "text-[9px] " + (active ? "opacity-90" : "opacity-30")
              }
            >
              {active ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
            </span>
          </button>
        ) : (
          <span>{col.label}</span>
        )}
        {(col.fieldId || col.tooltip) && (
          <HeaderInfo
            label={
              col.fieldId
                ? FIELD_REGISTRY[col.fieldId]?.label ?? col.label
                : col.label || "Info"
            }
            description={
              col.fieldId
                ? FIELD_REGISTRY[col.fieldId]?.description ?? ""
                : col.tooltip ?? ""
            }
          />
        )}
      </span>
    </th>
  );
}

/** Column-header info popover. Matches the editor's FieldInfo
 *  visual but is positioned for table-header context (centered
 *  below, dark-bg-on-light contrast). */
function HeaderInfo({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!description) return null;
  return (
    <span ref={wrapRef} className="relative inline-block normal-case">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/40 bg-transparent text-[9px] font-semibold leading-none text-white/80 hover:border-white hover:text-white"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-5 z-30 w-[260px] -translate-x-1/2 rounded-md border border-grid bg-white p-3 text-left text-[12px] leading-snug text-foreground/85 normal-case shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[11.5px] font-semibold text-navy">
            {label}
          </span>
          <span className="mt-1 block text-[12px] font-normal text-foreground/75">
            {description}
          </span>
        </span>
      )}
    </span>
  );
}

// ─── sort comparator ──────────────────────────────────────────────

function compareForKey(a: ResultRowVM, b: ResultRowVM, key: string): number {
  switch (key) {
    case "rank":
      return a.rank - b.rank;
    case "name":
      return a.name.localeCompare(b.name);
    case "market":
      return a.marketLabel.localeCompare(b.marketLabel);
    case "quadrant7Cell":
      return (a.quadrant7Cell ?? "").localeCompare(b.quadrant7Cell ?? "");
    case "estimatedPortfolio":
      return numCmp(a.estimatedPortfolioPoint, b.estimatedPortfolioPoint);
    case "urusT12":
      return numCmp(a.urusT12, b.urusT12);
    case "fitScore":
      return a.fitScore - b.fitScore;
    default:
      if (key.startsWith("criterion-")) {
        const fieldId = key.slice("criterion-".length);
        const va = readSortable(a, fieldId);
        const vb = readSortable(b, fieldId);
        if (typeof va === "number" && typeof vb === "number") return numCmp(va, vb);
        if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb);
        // mixed / null → push to bottom on desc
        if (va === null && vb !== null) return -1;
        if (va !== null && vb === null) return 1;
        return 0;
      }
      return 0;
  }
}

function readSortable(row: ResultRowVM, fieldId: string): number | string | null {
  const entry = FIELD_REGISTRY[fieldId];
  if (!entry) return null;
  const raw = entry.getValueFromPM(row.pm);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(",");
  return null;
}

function numCmp(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}
