// Per-quadrant color encoding used consistently across:
//   - the market-page quadrant cards
//   - the operator-name badge
//   - the operator card mini-metrics (DOM accent)
//   - the market coverage map dots and legend
//
// Source: design_handoff_market_landing/tokens.css. Hand-picked so each
// quadrant reads at a glance — MF/Inst green, MF/Indep magenta, Scattered/Inst
// teal, Scattered/Indep orange, Hybrid slate fallback.

// v0.6.3 polish — the operator badge + coverage-map dot colors still key
// off the v0.6.1 5-cell quadrant string (which every PM carries via
// pm.quadrant). The MARKET-LEVEL QuadrantSummaryCard, however, moved to
// the v0.6.2 7-cell taxonomy and renders via quadrant7-colors.ts. The
// SEGMENT_TO_COLOR / colorKeyToSegment plumbing that used to bridge color
// keys → URL segment slugs was removed because URL segments are now 7-cell
// and the new QuadrantSummaryCard handles its own segment lookup.

export type QuadrantColorKey =
  | "mfbtr-inst"
  | "mfbtr-ind"
  | "scattered-inst"
  | "scattered-ind"
  | "hybrid";

export type QuadrantColor = {
  /** Strong fill / dot / label color */
  fg: string;
  /** Soft background used for badge fills */
  soft: string;
  /** Display label */
  label: string;
};

export const QUADRANT_COLORS: Record<QuadrantColorKey, QuadrantColor> = {
  "mfbtr-inst": {
    fg: "#2E8B57",
    soft: "#E3F0E8",
    label: "MF/BTR · Institutional",
  },
  "mfbtr-ind": {
    fg: "#8B3A62",
    soft: "#F4E4EC",
    label: "MF/BTR · Independent",
  },
  "scattered-inst": {
    fg: "#1B6E8C",
    soft: "#E4F0F4",
    label: "Scattered · Institutional",
  },
  "scattered-ind": {
    fg: "#D97834",
    soft: "#FBEBDC",
    label: "Scattered · Independent",
  },
  hybrid: {
    fg: "#5A6B7B",
    soft: "#ECEEF1",
    label: "Hybrid",
  },
};

// Accept a DB quadrant string ("MF/BTR / Institutional", "Scattered /
// Independent", "Hybrid", or any v0.6.2 7-cell label that lowercases to a
// match) and resolve to one of the 5 color keys. Null/undefined → hybrid.
// 7-cell labels resolve via the same "mf"/"btr"/"scattered" substring
// checks (Small + Large MF/BTR both map to mfbtr-*, which keeps the badge
// palette compact at 5 colors for the row-level uses).
export function quadrantColorKey(input: string | null | undefined): QuadrantColorKey {
  if (!input) return "hybrid";
  const lower = input.toLowerCase();
  if (lower.includes("mf") || lower.includes("btr")) {
    return lower.includes("institutional") ? "mfbtr-inst" : "mfbtr-ind";
  }
  if (lower.includes("scattered") || lower.startsWith("sfr")) {
    return lower.includes("institutional") ? "scattered-inst" : "scattered-ind";
  }
  return "hybrid";
}

export function quadrantColor(input: string | null | undefined): QuadrantColor {
  return QUADRANT_COLORS[quadrantColorKey(input)];
}

// Ordered quadrant keys for the operator-landscape grid and the map legend.
export const QUADRANT_ORDER: QuadrantColorKey[] = [
  "mfbtr-inst",
  "mfbtr-ind",
  "scattered-inst",
  "scattered-ind",
];
