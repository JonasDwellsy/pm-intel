// Task 5 — rollup-granularity xlsx export for the Properties section (Phase 1
// property-level detail). Pure / sync / no DOM access, same shape as
// src/lib/watch-list/export.ts: the consumer (the download route) hands the
// workbook to XLSX.write(); a browser-side consumer would use
// XLSX.writeFile() the way DownloadButton.tsx does. Deliberately reuses that
// module's filename helpers rather than re-implementing slugification.
//
// One sheet ("Properties"), one row per `scorecard.propertyDetail.properties`
// record, plus the MSA-comp columns repeated on every row so the file is
// self-contained for filtering/pivoting outside the app. NEVER a
// score/star/percentile column here — property-detail-view.ts's module
// docstring explains why (rank-leak guardrail); this module mirrors that
// constraint for the export path.

import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import { buildFilename } from "@/lib/watch-list/export";
import type { PropertyRecord, ScorecardData } from "@/lib/types";

export interface PropertyExportResult {
  workbook: WorkBook;
  filename: string;
}

/** "community" → "Community", "sfr-submarket" → "SFR Submarket" — a plain
 *  human label for the Kind column. Raw `properties[].kind` values are
 *  otherwise the only place this distinction reads as a code-ish enum. */
function kindLabel(kind: PropertyRecord["kind"]): string {
  return kind === "community" ? "Community" : "SFR Submarket";
}

/** Decimal fraction → percentage points, one decimal place (0.031 → 3.1,
 *  0.17 → 17). Matches the convention export.ts's formatAdaptiveValue uses
 *  for its own rate columns (concessionRate, listingTrajectoryYoY,
 *  rentPerformanceYoY): `Math.round(value * 1000) / 10`. `null` passes
 *  through untouched so the cell renders blank rather than "0". */
function pct(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 1000) / 10;
}

const HEADERS = [
  "Property / Community",
  "Kind",
  "Submarket",
  "Units",
  "Homes",
  "N Listings",
  "Median DOM",
  "Median Rent",
  "Rent YoY %",
  "Concession %",
  "Listing Quality",
  "Mkt Median DOM",
  "Mkt Median Rent",
  "Mkt Rent YoY %",
  "Mkt Concession %",
] as const;

function buildPropertiesSheet(scorecard: ScorecardData): WorkSheet {
  const block = scorecard.propertyDetail;
  const comps = block?.comps ?? {
    medianDomT12: null,
    medianRentT12: null,
    rentYoY: null,
    concessionRate: null,
  };

  const dataRows: Array<Array<string | number | null>> = (block?.properties ?? []).map(
    (p) => [
      p.label,
      kindLabel(p.kind),
      p.submarket,
      p.units,
      p.homes,
      p.nListings,
      p.medianDomT12,
      p.medianRentT12,
      pct(p.rentYoY),
      pct(p.concessionRate),
      p.listingQuality,
      comps.medianDomT12,
      comps.medianRentT12,
      pct(comps.rentYoY),
      pct(comps.concessionRate),
    ]
  );

  const ws = XLSX.utils.aoa_to_sheet([[...HEADERS], ...dataRows]);
  ws["!cols"] = [
    { wch: 28 }, // Property / Community
    { wch: 14 }, // Kind
    { wch: 20 }, // Submarket
    { wch: 8 }, // Units
    { wch: 8 }, // Homes
    { wch: 11 }, // N Listings
    { wch: 12 }, // Median DOM
    { wch: 13 }, // Median Rent
    { wch: 12 }, // Rent YoY %
    { wch: 14 }, // Concession %
    { wch: 15 }, // Listing Quality
    { wch: 14 }, // Mkt Median DOM
    { wch: 15 }, // Mkt Median Rent
    { wch: 15 }, // Mkt Rent YoY %
    { wch: 16 }, // Mkt Concession %
  ];
  return ws;
}

/** Build the property-detail export workbook for one operator's scorecard.
 *  Pure — no IO, no DOM. Returns an empty (header-only) Properties sheet
 *  when `propertyDetail` is absent; callers that want to 404 on "nothing to
 *  export" (the download route) check `scorecard.propertyDetail` themselves
 *  before calling this. */
export function buildPropertyWorkbook(scorecard: ScorecardData): PropertyExportResult {
  const wb = XLSX.utils.book_new();
  const sheet = buildPropertiesSheet(scorecard);
  XLSX.utils.book_append_sheet(wb, sheet, "Properties");

  // Filename date source: `dataAsOf` is a required, always-present field
  // (unlike the optional `generatedText.generatedAt`), so it's the stable
  // choice for a Date that every scorecard — old seed or new — can supply.
  const generatedAt = new Date(scorecard.dataAsOf);

  return {
    workbook: wb,
    filename: buildFilename(`${scorecard.pm.name} properties`, generatedAt),
  };
}
