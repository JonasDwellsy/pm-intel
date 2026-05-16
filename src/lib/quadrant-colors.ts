// Per-quadrant color encoding used consistently across:
//   - the market-page quadrant cards
//   - the operator-name badge
//   - the operator card mini-metrics (DOM accent)
//   - the market coverage map dots and legend
//
// Source: design_handoff_market_landing/tokens.css. Hand-picked so each
// quadrant reads at a glance — MF/Inst green, MF/Indep magenta, Scattered/Inst
// teal, Scattered/Indep orange, Hybrid slate fallback.

import type { QuadrantSegment } from "@/lib/slugify";

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
    label: "Scattered Site · Institutional",
  },
  "scattered-ind": {
    fg: "#D97834",
    soft: "#FBEBDC",
    label: "Scattered Site · Independent",
  },
  hybrid: {
    fg: "#5A6B7B",
    soft: "#ECEEF1",
    label: "Hybrid",
  },
};

const SEGMENT_TO_COLOR: Record<QuadrantSegment, QuadrantColorKey> = {
  "multifamily-institutional": "mfbtr-inst",
  "multifamily-independent": "mfbtr-ind",
  "scattered-institutional": "scattered-inst",
  "scattered-independent": "scattered-ind",
  hybrid: "hybrid",
};

// Accept either a DB quadrant string ("MF/BTR / Institutional"), a URL
// segment ("scattered-independent"), or null/undefined → hybrid fallback.
export function quadrantColorKey(input: string | null | undefined): QuadrantColorKey {
  if (!input) return "hybrid";
  // DB string form
  const lower = input.toLowerCase();
  if (lower.includes("mf") || lower.includes("btr")) {
    return lower.includes("institutional") ? "mfbtr-inst" : "mfbtr-ind";
  }
  if (lower.includes("scattered")) {
    return lower.includes("institutional") ? "scattered-inst" : "scattered-ind";
  }
  // Segment slug form
  if (input in SEGMENT_TO_COLOR) {
    return SEGMENT_TO_COLOR[input as QuadrantSegment];
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

// Map quadrant color key → URL segment slug (used by the quadrant cards' "View
// operators →" links and the map legend rows).
const COLOR_KEY_TO_SEGMENT: Record<QuadrantColorKey, QuadrantSegment> = {
  "mfbtr-inst": "multifamily-institutional",
  "mfbtr-ind": "multifamily-independent",
  "scattered-inst": "scattered-institutional",
  "scattered-ind": "scattered-independent",
  hybrid: "hybrid",
};

export function colorKeyToSegment(key: QuadrantColorKey): QuadrantSegment {
  return COLOR_KEY_TO_SEGMENT[key];
}
