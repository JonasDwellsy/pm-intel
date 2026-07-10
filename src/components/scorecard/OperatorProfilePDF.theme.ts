// PDF design tokens + StyleSheet, extracted from OperatorProfilePDF.tsx so the
// ~3k-line component isn't also carrying ~490 lines of style definitions. Pure
// constants, imported by the PDF component. Colors mirror the OG image + live-
// scorecard palette so the share artifacts read as one product.
import { StyleSheet } from "@react-pdf/renderer";

export const COLOR_NAVY = "#0f1f3f";
export const COLOR_TEAL = "#1b6e8c";
export const COLOR_GOLD = "#E5A800";
export const COLOR_SILVER = "#9CA3AF";
export const COLOR_MUTED = "#5f6b80";
export const COLOR_MUTED_2 = "#8b95a8";
export const COLOR_GRID = "#e1e5ec";
export const COLOR_SURFACE = "#f6f7fa";
export const COLOR_BG = "#ffffff";
// Directional tones — mirror --color-good / --color-bad from
// globals.css so the Trajectory delta + Performance trend labels
// read the same green/red as the live report.
export const COLOR_GOOD = "#3e7c3e";
export const COLOR_BAD = "#a63a2a";
// Teal used for the peer-comparison IQR band + the sparkline stroke.
// The live components use #0E7C86 for the sparkline; we reuse the
// existing brand COLOR_TEAL (#1b6e8c) for consistency across the PDF.
export const COLOR_TEAL_SOFT = "#d3e5eb";

export const styles = StyleSheet.create({
  // --- Page chrome ---
  page: {
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLOR_NAVY,
    fontFamily: "Helvetica",
    backgroundColor: COLOR_BG,
  },
  // --- Header ---
  brandRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  brandText: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  brandSep: {
    fontSize: 10,
    color: COLOR_MUTED,
  },
  brandEyebrow: {
    fontSize: 9,
    fontWeight: 600,
    color: COLOR_TEAL,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  // --- Identity hero ---
  operatorName: {
    fontSize: 28,
    fontWeight: 700,
    color: COLOR_NAVY,
    letterSpacing: -0.4,
    lineHeight: 1.1,
    marginTop: 8,
    fontFamily: "Helvetica-Bold",
  },
  operatorMeta: {
    fontSize: 12,
    color: COLOR_MUTED,
    marginTop: 6,
    fontWeight: 500,
  },
  starRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  starChip: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
  },
  starChipText: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  starChipLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: COLOR_MUTED,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  starGlyph: {
    fontSize: 10,
    lineHeight: 1,
  },
  cohortFraming: {
    fontSize: 11,
    color: COLOR_MUTED,
    marginTop: 14,
    lineHeight: 1.45,
    maxWidth: 480,
  },
  // --- Section headers ---
  sectionHeader: {
    fontSize: 8,
    fontWeight: 700,
    color: COLOR_TEAL,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
  },
  paragraph: {
    fontSize: 10.5,
    lineHeight: 1.55,
    color: COLOR_NAVY,
    maxWidth: 500,
  },
  // --- Metric tiles ---
  tilesGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  tile: {
    width: "31.5%",
    padding: 10,
    backgroundColor: COLOR_BG,
    borderColor: COLOR_GRID,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 6,
  },
  tileTitle: {
    fontSize: 7.5,
    fontWeight: 700,
    color: COLOR_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Helvetica-Bold",
  },
  tileValueRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 6,
  },
  tileValue: {
    fontSize: 18,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  tileUnit: {
    fontSize: 9,
    color: COLOR_MUTED,
    fontWeight: 500,
  },
  tileCompare: {
    fontSize: 9,
    color: COLOR_MUTED,
    marginTop: 4,
    lineHeight: 1.35,
  },
  // --- Bullets ---
  bulletRow: {
    display: "flex",
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  bulletDot: {
    fontSize: 10,
    color: COLOR_TEAL,
    lineHeight: 1.55,
  },
  bulletText: {
    fontSize: 10.5,
    lineHeight: 1.55,
    color: COLOR_NAVY,
    flex: 1,
  },
  // --- Signal cards (Pages 2/3) ---
  signalCard: {
    padding: 12,
    marginTop: 8,
    backgroundColor: COLOR_SURFACE,
    borderColor: COLOR_GRID,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 6,
  },
  // PR #86 — Concession sample card. Italic + indented + muted to
  // visually distinguish operator-quoted text from the surrounding
  // narrative.
  concessionSample: {
    marginTop: 6,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR_TEAL,
  },
  concessionSampleText: {
    fontSize: 9.5,
    fontStyle: "italic",
    color: COLOR_MUTED,
    lineHeight: 1.45,
  },
  signalTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  signalDetail: {
    fontSize: 10,
    color: COLOR_MUTED,
    marginTop: 4,
    lineHeight: 1.45,
  },
  // --- Page header (smaller, repeats on pages 2+) ---
  pageHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLOR_GRID,
  },
  pageHeaderTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  pageHeaderMeta: {
    fontSize: 8,
    color: COLOR_MUTED_2,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  // --- Footer (every page) ---
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 28,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLOR_GRID,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 8,
    color: COLOR_MUTED_2,
  },
  footerLink: {
    color: COLOR_TEAL,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
  },
  // --- Trajectory page (mirrors OperatorTrajectorySection.tsx) ---
  trajectorySubtitle: {
    fontSize: 10,
    color: COLOR_MUTED,
    marginTop: 2,
    marginBottom: 4,
    lineHeight: 1.45,
  },
  trajectoryHeadlineRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  trajectoryHeadlineEyebrow: {
    fontSize: 8,
    fontWeight: 700,
    color: COLOR_MUTED,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  trajectoryHeadlineValue: {
    fontSize: 22,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  trajectoryDelta: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
  },
  trajectoryAxisRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  trajectoryAxisLabel: {
    fontSize: 8,
    color: COLOR_MUTED_2,
  },
  trajectoryAxisCenter: {
    fontSize: 8,
    color: COLOR_MUTED_2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  trajectoryFooter: {
    fontSize: 8.5,
    color: COLOR_MUTED_2,
    marginTop: 16,
    lineHeight: 1.45,
  },
  // --- Generic table (Trajectory snapshots + Methodology tables) ---
  tableHeaderRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLOR_GRID,
    paddingVertical: 4,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLOR_GRID,
    paddingVertical: 4,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontWeight: 700,
    color: COLOR_MUTED,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  tableCell: {
    fontSize: 9,
    color: COLOR_NAVY,
  },
  tableCellMuted: {
    fontSize: 9,
    color: COLOR_MUTED,
  },
  // --- Performance card enrichment (mirrors PerformanceLayer.tsx) ---
  perfCard: {
    padding: 14,
    marginTop: 8,
    backgroundColor: COLOR_BG,
    borderColor: COLOR_GRID,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 6,
  },
  perfCardHeaderRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLOR_GRID,
    paddingBottom: 8,
  },
  perfCardTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
  },
  perfCardQualifier: {
    fontSize: 9,
    color: COLOR_MUTED,
    marginTop: 3,
  },
  perfHeadlineValue: {
    fontSize: 26,
    fontWeight: 700,
    color: COLOR_NAVY,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1,
  },
  perfHeadlineUnit: {
    fontSize: 9,
    color: COLOR_MUTED,
    marginTop: 3,
  },
  perfTrend: {
    fontSize: 9.5,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
  },
  perfEyebrowMuted: {
    fontSize: 7.5,
    fontWeight: 700,
    color: COLOR_MUTED,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  perfDistCaption: {
    fontSize: 8,
    color: COLOR_MUTED_2,
    marginTop: 4,
    lineHeight: 1.4,
  },
  perfContext: {
    fontSize: 9.5,
    color: COLOR_MUTED,
    marginTop: 8,
    lineHeight: 1.5,
  },
  perfFootnote: {
    fontSize: 8.5,
    fontStyle: "italic",
    color: COLOR_MUTED_2,
    marginTop: 4,
    lineHeight: 1.4,
  },
  // Peer mini-table row
  peerRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLOR_GRID,
  },
  peerName: {
    fontSize: 9,
    color: COLOR_NAVY,
  },
  peerValue: {
    fontSize: 9,
    color: COLOR_NAVY,
    textAlign: "right",
  },
});
