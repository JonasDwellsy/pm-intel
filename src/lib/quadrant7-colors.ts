// 7-cell quadrant color encoding used on the v1.0 scorecard Identity hero
// (Layer 1) and anywhere else we need to badge the classification.
//
// Mapping decision: the four "dominant" 5-cell colors carry forward unchanged
// (Large MF Inst = green, Large MF Ind = magenta, SFR Inst = teal, SFR Ind =
// orange, Hybrid = slate). The two new cells — Small MF/BTR Independent and
// Small MF/BTR Institutional — get lighter sister-shades in the same hue
// family so the visual relationship to their Large counterparts reads at a
// glance. Picked to preserve AA contrast on white badge fills.
//
// Existing public scorecard surfaces continue to read from lib/quadrant-colors.ts
// (5-cell). This file is the 7-cell sibling used by v1.0 components.

export type Quadrant7CellKey =
  | "sfr-ind"
  | "sfr-inst"
  | "small-mfbtr-ind"
  | "small-mfbtr-inst"
  | "large-mfbtr-ind"
  | "large-mfbtr-inst"
  | "hybrid";

export type Quadrant7CellColor = {
  /** Strong foreground (text + dot color) */
  fg: string;
  /** Soft background (badge fill, AA-contrasting with fg) */
  soft: string;
  /** Border tint (subtle outline at ~18% mix with fg) */
  border: string;
  /** Display label */
  label: string;
};

export const QUADRANT7_COLORS: Record<Quadrant7CellKey, Quadrant7CellColor> = {
  // SFR — carries over Scattered colors from the 5-cell palette.
  "sfr-ind": {
    fg: "#D97834",
    soft: "#FBEBDC",
    border: "rgba(217, 120, 52, 0.20)",
    label: "SFR Independent",
  },
  "sfr-inst": {
    fg: "#1B6E8C",
    soft: "#E4F0F4",
    border: "rgba(27, 110, 140, 0.20)",
    label: "SFR Institutional",
  },
  // Small MF/BTR — proposed lighter sister-shades in the same hue family as
  // their Large counterparts. Reads as related-but-distinct.
  "small-mfbtr-ind": {
    fg: "#B86A8E",
    soft: "#F7E9F0",
    border: "rgba(184, 106, 142, 0.22)",
    label: "Small MF/BTR Independent",
  },
  "small-mfbtr-inst": {
    fg: "#5BA67E",
    soft: "#E8F2EB",
    border: "rgba(91, 166, 126, 0.22)",
    label: "Small MF/BTR Institutional",
  },
  // Large MF/BTR — carries over MF/BTR colors from the 5-cell palette.
  "large-mfbtr-ind": {
    fg: "#8B3A62",
    soft: "#F4E4EC",
    border: "rgba(139, 58, 98, 0.20)",
    label: "Large MF/BTR Independent",
  },
  "large-mfbtr-inst": {
    fg: "#2E8B57",
    soft: "#E3F0E8",
    border: "rgba(46, 139, 87, 0.20)",
    label: "Large MF/BTR Institutional",
  },
  // Hybrid — slate, carried over from 5-cell.
  hybrid: {
    fg: "#5A6B7B",
    soft: "#ECEEF1",
    border: "rgba(90, 107, 123, 0.20)",
    label: "Hybrid",
  },
};

// Map a v0.6.2 `quadrant7Cell` string to the color key. Accepts the exact
// canonical strings from the seed ("SFR Independent", "Large MF/BTR
// Institutional", etc.) and a few defensive normalizations.
export function quadrant7Key(
  input: string | null | undefined
): Quadrant7CellKey {
  if (!input) return "hybrid";
  const lower = input.toLowerCase();
  if (lower.startsWith("sfr")) {
    return lower.includes("institutional") ? "sfr-inst" : "sfr-ind";
  }
  if (lower.startsWith("small")) {
    return lower.includes("institutional") ? "small-mfbtr-inst" : "small-mfbtr-ind";
  }
  if (lower.startsWith("large")) {
    return lower.includes("institutional") ? "large-mfbtr-inst" : "large-mfbtr-ind";
  }
  if (lower.startsWith("hybrid")) return "hybrid";
  // Defensive fallback: 5-cell labels still slot in cleanly to Large variants.
  if (lower.includes("mf") || lower.includes("btr")) {
    return lower.includes("institutional")
      ? "large-mfbtr-inst"
      : "large-mfbtr-ind";
  }
  if (lower.includes("scattered")) {
    return lower.includes("institutional") ? "sfr-inst" : "sfr-ind";
  }
  return "hybrid";
}

export function quadrant7Color(
  input: string | null | undefined
): Quadrant7CellColor {
  return QUADRANT7_COLORS[quadrant7Key(input)];
}
