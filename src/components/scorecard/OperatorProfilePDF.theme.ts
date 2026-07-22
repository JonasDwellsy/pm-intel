// PDF design tokens + StyleSheet for the Operator IQ scorecard PDF (design v3).
//
// This is the VIOLET print system from the Claude-Design handoff
// (docs/design/pdf-scorecard-v3/README.md). It intentionally DIVERGES from the
// live web scorecard (which keeps the navy/teal system) — the PDF is its own
// deal-room artifact. Pure constants; Inter font registration lives in the
// component (OperatorProfilePDF.tsx) alongside the hyphenation callback.
import { StyleSheet } from "@react-pdf/renderer";

// Font family registered in the component. Weights selected via `fontWeight`.
export const FONT = "Inter";

// --- Palette (README "Design tokens") ---
export const NIGHT_BASE = "#0a1124"; // dark hero base
export const NIGHT_LIGHT = "#131a3e"; // hero gradient light end

export const INK = "#0c1322"; // headings
export const BODY = "#2c3344"; // body text
export const MUTED = "#5d6678"; // secondary / labels
export const FAINT = "#9aa1ae"; // tick labels / captions

export const BORDER = "#e5e7eb"; // hairline
export const BAND = "#d9dee8"; // cohort band grey / heavy table rule
export const TILE = "#f5f6f8"; // tile / track / disclaimer panel grey
export const CHIP = "#eef0f3"; // neutral chip grey

export const VIOLET = "#5b3cff"; // primary data + STRONG
export const VIOLET_SOFT = "#ece8ff";
export const ROW_HL = "#f4f1ff"; // peer / property "this operator" row highlight

export const TEAL = "#2bb3c7"; // secondary data
export const TEAL_CHIP_BG = "#dff3f6";
export const TEAL_CHIP_FG = "#0e6b79";

export const MAGENTA_CHIP_BG = "#fbe7f3";
export const MAGENTA_CHIP_FG = "#99206c";

export const YELLOW = "#ffc820"; // wordmark IQ, gold medal, sparkline end-dot
export const YELLOW_RING = "#d99f00";
export const SILVER = "#cdd3dd"; // silver medal
export const SILVER_RING = "#9aa1ae";

// Directional tones for YoY / deltas (mirror the teal/magenta chip fgs).
export const POS = TEAL_CHIP_FG; // positive / better
export const NEG = MAGENTA_CHIP_FG; // negative / worse

// Legacy aliases still imported by the coverage-map block (recolored to violet
// at the call site; kept exported so pdf-coverage-map consumers don't break).
export const COLOR_TEAL = TEAL;
export const COLOR_GRID = BORDER;
export const COLOR_MUTED_2 = FAINT;

// --- Page geometry ---
export const PAGE_PADDING_X = 56;
export const PAGE_PADDING_TOP = 74; // clears the fixed running head (pages 2+)
export const PAGE_PADDING_BOTTOM = 52; // clears the fixed footer

export const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING_TOP,
    paddingBottom: PAGE_PADDING_BOTTOM,
    paddingLeft: PAGE_PADDING_X,
    paddingRight: PAGE_PADDING_X,
    fontSize: 10,
    color: BODY,
    fontFamily: FONT,
    backgroundColor: "#ffffff",
    letterSpacing: -0.1,
  },

  // --- Section header (violet number + h2 + optional chip + intro sentence) ---
  sectionNum: {
    fontSize: 14,
    fontWeight: 800,
    color: VIOLET,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: INK,
    letterSpacing: -0.5,
  },
  sectionIntro: {
    fontSize: 11,
    color: BODY,
    lineHeight: 1.45,
    marginTop: 6,
    marginBottom: 10,
  },
  // Sub-heading inside a section (methodology sub-sections).
  subHead: {
    fontSize: 9,
    fontWeight: 700,
    color: MUTED,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10.5,
    lineHeight: 1.5,
    color: BODY,
  },

  // --- Micro label (letterspaced, e.g. "30-SECOND READOUT", tile labels) ---
  microLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: MUTED,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },

  // --- Card ---
  card: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 12,
  },

  // --- Running head (pages 2+) ---
  runHeadName: { fontSize: 10, fontWeight: 600, color: MUTED },
  runHeadRight: {
    fontSize: 9,
    fontWeight: 700,
    color: FAINT,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  // --- Footer (every page) ---
  footer: {
    position: "absolute",
    left: PAGE_PADDING_X,
    right: PAGE_PADDING_X,
    bottom: 26,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: BORDER,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 9.5,
    fontWeight: 500,
    color: FAINT,
  },
  footerLink: { color: MUTED, fontWeight: 600 },

  // --- Generic table (methodology + properties) ---
  tableHeaderRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomStyle: "solid",
    borderBottomColor: BAND,
    paddingBottom: 6,
    paddingTop: 2,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 700,
    color: FAINT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomStyle: "solid",
    borderBottomColor: BORDER,
    paddingVertical: 8,
  },
  tableCell: { fontSize: 10, color: BODY },
  tableCellBold: { fontSize: 10, color: INK, fontWeight: 700 },
  tableCellMuted: { fontSize: 10, color: MUTED },
});
