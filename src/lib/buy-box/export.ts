// v0.12 — Excel export for the buy-box results page.
//
// Three-sheet workbook (Summary / Operators / Markets) generated
// from the same ResultRowVM arrays the results table renders. No
// re-evaluation of the buy box at export time — the rows already
// carry every value the workbook needs (PM record for adaptive
// column reads via FIELD_REGISTRY[id].getValueFromPM, plus the
// pre-projected display fields on the VM itself).
//
// The xlsx package is heavy (~600KB unminified) so the workbook
// builder is a sync function but the consumer is expected to
// dynamic-import xlsx itself + the writeFile helper; see
// DownloadButton.tsx for the load-on-click pattern.
//
// This module is pure / sync / no DOM access — the side effect
// (Blob → anchor click → file download) is the consumer's
// responsibility. That makes the workbook easy to unit-test
// without a real browser.

import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";

import { resolveAdaptiveColumns } from "./adaptive-columns";
import { formatCriterion } from "./criterion-format";
import { FIELD_REGISTRY, type FilterCriterion, type WeightedCriterion } from "./fields";
import type { ResultRowVM } from "./results-view";

/** A subset of the BuyBoxRecord shape the export needs. The page
 *  passes through the full record but the export only reads what's
 *  listed here. */
export interface ExportBuyBox {
  id: string;
  name: string;
  description: string | null;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

export interface ExportArgs {
  buyBox: ExportBuyBox;
  operatorRows: ResultRowVM[];
  marketRows: ResultRowVM[];
  totalCandidates: number;
  methodologyVersion: string;
  /** Absolute URL of the live results page — surfaces in the
   *  Summary sheet so a downloaded file is self-documenting. */
  liveUrl: string;
  /** When the page was generated. Stamped on the Summary sheet. */
  generatedAt: Date;
}

export interface ExportResult {
  workbook: WorkBook;
  filename: string;
}

// ─── Filename slugifier ──────────────────────────────────────────

/** Lowercase, alphanumerics + dashes only, collapse runs of
 *  separators. Used to slugify a buy box's name into a safe file
 *  prefix; pure string transform, no IO. */
export function slugifyForFilename(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) // hard cap so genuinely insane names still produce sensible filenames
    || "buy-box";
}

function isoDate(d: Date): string {
  // Pad month + day — Date.toISOString() returns ISO but with time;
  // we want only the YYYY-MM-DD prefix.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Build the export filename: "{slugified-name}-{YYYY-MM-DD}.xlsx". */
export function buildFilename(buyBoxName: string, generatedAt: Date): string {
  return `${slugifyForFilename(buyBoxName)}-${isoDate(generatedAt)}.xlsx`;
}

// ─── Workbook builder ────────────────────────────────────────────

export function buildWorkbook(args: ExportArgs): ExportResult {
  const wb = XLSX.utils.book_new();

  // Operators uses canonical rollups; Markets uses per-PM-market
  // rows. Both share the same adaptive-column resolution so the
  // user sees the same criterion columns on both sheets.
  const adaptive = resolveAdaptiveColumns({
    requiredCriteria: args.buyBox.requiredCriteria,
    preferredCriteria: args.buyBox.preferredCriteria,
    excludedCriteria: args.buyBox.excludedCriteria,
  });

  const summary = buildSummarySheet(args);
  const operators = buildOperatorsSheet(args.operatorRows, adaptive);
  const markets = buildMarketsSheet(args.marketRows, adaptive);

  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, operators, "Operators");
  XLSX.utils.book_append_sheet(wb, markets, "Markets");

  return {
    workbook: wb,
    filename: buildFilename(args.buyBox.name, args.generatedAt),
  };
}

// ─── Sheet builders ──────────────────────────────────────────────

function buildSummarySheet(args: ExportArgs): WorkSheet {
  const { buyBox } = args;
  const matchedCount = args.operatorRows.length;
  const totalOps = args.totalCandidates;
  const matchRate =
    totalOps > 0 ? `${Math.round((matchedCount / totalOps) * 1000) / 10}%` : "—";

  // Build rows as an array-of-arrays. Each row is [label, value].
  // Blank arrays render as visual section separators in Excel.
  const rows: Array<Array<string | number>> = [
    ["Buy box name", buyBox.name],
  ];
  if (buyBox.description) {
    rows.push(["Description", buyBox.description]);
  }
  rows.push(
    ["Generated on", args.generatedAt.toISOString()],
    ["Generated (local)", args.generatedAt.toLocaleString()],
    ["Methodology version", args.methodologyVersion],
    ["Total operators evaluated", totalOps],
    ["Operators matched", matchedCount],
    ["Match rate", matchRate],
    [],
    ["Required criteria"]
  );
  if (buyBox.requiredCriteria.length === 0) {
    rows.push(["", "(none)"]);
  } else {
    for (const c of buyBox.requiredCriteria) {
      rows.push(["", formatCriterion(c)]);
    }
  }
  rows.push([], ["Preferred criteria (weighted)"]);
  if (buyBox.preferredCriteria.length === 0) {
    rows.push(["", "(none)"]);
  } else {
    for (const c of buyBox.preferredCriteria) {
      rows.push(["", formatCriterion(c)]);
    }
  }
  rows.push([], ["Excluded criteria"]);
  if (buyBox.excludedCriteria.length === 0) {
    rows.push(["", "(none)"]);
  } else {
    for (const c of buyBox.excludedCriteria) {
      rows.push(["", formatCriterion(c)]);
    }
  }
  rows.push([], ["Live results page", args.liveUrl]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Widen column A (labels) and column B (values) so the longer
  // criterion lines render without truncation in Excel's default
  // viewport.
  ws["!cols"] = [{ wch: 28 }, { wch: 80 }];
  return ws;
}

function buildOperatorsSheet(
  rows: ResultRowVM[],
  adaptive: ReturnType<typeof resolveAdaptiveColumns>
): WorkSheet {
  // Operators sheet sorted by fit score desc — matches the in-app
  // operator-view default. The page hands us rows pre-sorted by
  // rank (which is fit-score desc) so a copy + stable rank sort
  // produces the same order; we do an explicit sort to be safe.
  const sorted = [...rows].sort((a, b) => b.fitScore - a.fitScore);

  const headers = [
    "Rank",
    "Operator",
    "Markets",
    "7-Cell",
    "Est. Portfolio",
    "Est. Portfolio Low",
    "Est. Portfolio High",
    "URUs T12",
    "Listing YoY %",
    "Concession Rate %",
    "Fit Score",
    ...adaptive.map((c) => c.entry.label),
  ];

  const dataRows = sorted.map((r) => {
    const q7 = r.quadrant7Cell
      ? r.quadrant7CellIsMixed
        ? `${r.quadrant7Cell} (Mixed)`
        : r.quadrant7Cell
      : null;
    const out: Array<string | number | null> = [
      r.rank,
      r.name,
      r.marketLabel,
      q7,
      r.estimatedPortfolioPoint,
      r.estimatedPortfolioLow,
      r.estimatedPortfolioHigh,
      r.urusT12,
      r.listingTrajectoryYoY === null
        ? null
        : Math.round(r.listingTrajectoryYoY * 1000) / 10, // 0.0523 → 5.2
      r.concessionRate === null
        ? null
        : Math.round(r.concessionRate * 1000) / 10,
      r.fitScore,
    ];
    for (const col of adaptive) {
      out.push(formatAdaptiveValue(col.fieldId, col.entry.getValueFromPM(r.pm)));
    }
    return out;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = colWidthsForOperatorsSheet(adaptive.length);
  return ws;
}

function buildMarketsSheet(
  rows: ResultRowVM[],
  adaptive: ReturnType<typeof resolveAdaptiveColumns>
): WorkSheet {
  // Markets sheet sorted by operator name then fit score desc
  // (per spec). One row per PM-market pair — Ark Homes For Rent
  // appears in 4 rows where Operators has 1.
  const sorted = [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return b.fitScore - a.fitScore;
  });

  const headers = [
    "Operator",
    "Market",
    "7-Cell",
    "Est. Portfolio",
    "URUs T12",
    "Listing YoY %",
    "Concession Rate %",
    "Fit Score",
    ...adaptive.map((c) => c.entry.label),
  ];

  const dataRows = sorted.map((r) => {
    const out: Array<string | number | null> = [
      r.name,
      r.marketLabel,
      r.quadrant7Cell,
      r.estimatedPortfolioPoint,
      r.urusT12,
      r.listingTrajectoryYoY === null
        ? null
        : Math.round(r.listingTrajectoryYoY * 1000) / 10,
      r.concessionRate === null
        ? null
        : Math.round(r.concessionRate * 1000) / 10,
      r.fitScore,
    ];
    for (const col of adaptive) {
      out.push(formatAdaptiveValue(col.fieldId, col.entry.getValueFromPM(r.pm)));
    }
    return out;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = colWidthsForMarketsSheet(adaptive.length);
  return ws;
}

// ─── Adaptive value formatter ────────────────────────────────────

/** Coerce a registry field value into something Excel renders
 *  cleanly. Decimal-percent fields multiply ×100 so the user sees
 *  "5.2" instead of "0.052"; booleans render as "yes" / "no";
 *  arrays join with commas. Numbers come through untouched so
 *  Excel can use its native number cell type. */
function formatAdaptiveValue(
  fieldId: string,
  value: ReturnType<(typeof FIELD_REGISTRY)[string]["getValueFromPM"]>
): string | number | null {
  if (value === null || value === undefined) return null;
  const decimalPercent =
    fieldId === "concessionRate" ||
    fieldId === "concessionTrajectory" ||
    fieldId === "listingTrajectoryYoY" ||
    fieldId === "rentPerformanceYoY";
  if (typeof value === "number" && decimalPercent) {
    return Math.round(value * 1000) / 10;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

// ─── Column width helpers ────────────────────────────────────────

function colWidthsForOperatorsSheet(adaptiveCount: number) {
  return [
    { wch: 5 }, // Rank
    { wch: 32 }, // Operator
    { wch: 28 }, // Markets
    { wch: 26 }, // 7-Cell (with possible " (Mixed)" suffix)
    { wch: 13 }, // Est. Portfolio
    { wch: 16 }, // Est. Portfolio Low
    { wch: 16 }, // Est. Portfolio High
    { wch: 10 }, // URUs T12
    { wch: 14 }, // Listing YoY %
    { wch: 18 }, // Concession Rate %
    { wch: 10 }, // Fit Score
    ...Array.from({ length: adaptiveCount }, () => ({ wch: 18 })),
  ];
}

function colWidthsForMarketsSheet(adaptiveCount: number) {
  return [
    { wch: 32 }, // Operator
    { wch: 28 }, // Market
    { wch: 22 }, // 7-Cell
    { wch: 13 }, // Est. Portfolio
    { wch: 10 }, // URUs T12
    { wch: 14 }, // Listing YoY %
    { wch: 18 }, // Concession Rate %
    { wch: 10 }, // Fit Score
    ...Array.from({ length: adaptiveCount }, () => ({ wch: 18 })),
  ];
}
