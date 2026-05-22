"use client";

// v0.12 — buy-box results Excel export button.
//
// Lives in the page header next to Edit Buy Box + Re-Run. Click
// dynamic-imports xlsx + the workbook builder, hands the
// pre-projected row data over, and triggers a browser download.
//
// Dynamic import matters: the xlsx package is ~600KB unminified.
// Loading it on first page render would balloon the
// /buy-boxes/[id]/results bundle. Loading on click moves that
// cost off the critical path — the user pays for it only when
// they actually want a workbook.

import * as React from "react";
import { capture } from "@/lib/analytics";
import type { ResultRowVM } from "@/lib/buy-box/results-view";
import type { ExportBuyBox } from "@/lib/buy-box/export";

interface Props {
  buyBox: ExportBuyBox;
  operatorRows: ResultRowVM[];
  marketRows: ResultRowVM[];
  totalCandidates: number;
  methodologyVersion: string;
  /** Built server-side by the page using the absolute deployment
   *  URL — the export Summary sheet links back to it. */
  liveUrl: string;
}

export function DownloadButton({
  buyBox,
  operatorRows,
  marketRows,
  totalCandidates,
  methodologyVersion,
  liveUrl,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    capture("buy_box_export_click", {
      buyBoxId: buyBox.id,
      operatorCount: operatorRows.length,
    });
    try {
      // Dynamic import so the xlsx package is fetched only on
      // first click + cached for subsequent ones.
      const [{ buildWorkbook }, XLSX] = await Promise.all([
        import("@/lib/buy-box/export"),
        import("xlsx"),
      ]);
      const { workbook, filename } = buildWorkbook({
        buyBox,
        operatorRows,
        marketRows,
        totalCandidates,
        methodologyVersion,
        liveUrl,
        generatedAt: new Date(),
      });
      // XLSX.writeFile() triggers the browser download via a
      // <a download> click; no manual blob plumbing needed.
      XLSX.writeFile(workbook, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="h-9 inline-flex items-center gap-1.5 rounded-md border border-grid bg-white px-3.5 text-[13px] font-medium text-navy hover:bg-surface-soft disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Spinner /> : <DownloadIcon />}
        <span>{loading ? "Generating…" : "Download"}</span>
      </button>
      {error && (
        <p className="text-[11.5px] text-bad">Export failed. Please try again.</p>
      )}
    </div>
  );
}

function DownloadIcon() {
  // Inline SVG to match the project's no-lucide convention (the
  // existing ScorecardSidebar inlines its share icon the same
  // way). 14×14 to align visually with the button's 13px text.
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
