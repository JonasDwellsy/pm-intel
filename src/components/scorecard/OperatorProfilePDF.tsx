// PR #84 — Operator profile PDF.
//
// Purpose-built deal-room artifact. Replaces the old window.print()
// "Print / Save as PDF" path (which rendered the live page DOM
// through the browser's print pipeline and produced inconsistent
// output across browsers). Instead, this is a deterministic 7-page
// PDF rendered server-side via @react-pdf/renderer, branded to
// match the OG-image design language (navy + teal + gold/silver
// star chips), at full content parity with the live web report:
//
//   Page 1 — Identity + Synthesis
//     Wordmark + operator name + cohort + star chips +
//     cohort framing sentence + executive summary +
//     headline metric tiles + distinguishing characteristics
//
//   Page 2 — Performance dimensions  (mirrors PerformanceLayer.tsx)
//     One card per starable axis (Lease-up Performance, Tenant
//     Retention, Rent Performance, Marketing Discipline, +
//     Inventory Transparency for MF/BTR). Each card carries the
//     headline value + star, sample size (n), a P25/median/P75
//     distribution band with a focal marker, and a nearest-peers
//     mini-table (name + value + mini-bar). Cards flow (wrap) onto
//     a continuation page when content overflows.
//
//   Page 3 — Lending signals
//     The 5 underwriting-relevant synthesis signals from
//     buildLendingSignals (Vacancy, Rent Stability, Operator
//     Stability, Geographic Concentration, Pricing Tier).
//
//   Page 4 — Geographic Coverage & Rent
//     Mapbox (or SVG fallback) coverage map + narrative, and the
//     6-quarter mix-adjusted rent trajectory chart with the cohort
//     median overlay.
//
//   Page 5 — Portfolio context
//     Estimated portfolio + range + confidence, rent-level snapshot,
//     share-of-listing-activity, cross-market presence (if
//     multi-market), concession activity + sample excerpts.
//
//   Page 6 — Trajectory  (mirrors OperatorTrajectorySection.tsx)
//     How the operator has tracked across Dwellsy IQ refreshes: an
//     est.-portfolio sparkline with a net-change delta, axis
//     endpoint labels, and a newest-first per-snapshot table
//     (Refresh · Est. portfolio · Gold · Silver · Ranked). Omitted
//     entirely when there are no snapshots.
//
//   Page 7 — Methodology & limits  (mirrors MethodologyFooter.tsx)
//     Version stamp + dataAsOf + caveats, plus ported coverage-
//     parameters, portfolio-composition, and per-metric sample-size
//     tables. Pointer to iq.dwellsy.com/methodology.
//
// Every page carries a footer with brand + page number + URL +
// methodology + dataAsOf. Charts are drawn with @react-pdf/renderer
// native SVG primitives (no Recharts — that's client-side only), so
// the sparkline / distribution bands / rent trajectory all render
// server-side. NOTE: the Trajectory page is conditional, so when an
// operator has zero snapshots the document is 6 pages and the
// footers still read "of 7" (the page just doesn't exist).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Rect,
  Line,
  Circle,
  Polyline,
  G,
} from "@react-pdf/renderer";
import type { ScorecardData, StarLevel } from "@/lib/types";
import { marketingDataSuppressed } from "@/lib/types";
import {
  buildCohortFramingSentence,
  countOperatorStars,
  starableAxisCount,
} from "@/lib/operators/stars";
import type { CohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import type {
  LendingSignals,
  VacancySignal,
  RentStabilitySignal,
  OperatorStabilitySignal,
  GeographicConcentrationSignal,
  PricingTierSignal,
} from "@/lib/lending-signals";
import type { ShareTrajectoryView } from "@/lib/share-trajectory";
import {
  summarizeTrajectory,
  buildSparkline,
} from "@/lib/operators/trajectory";
import type {
  OperatorTrajectory,
  TrajectoryPoint,
} from "@/lib/operators/trajectory";
import {
  METRIC_DIRECTIONS,
} from "@/lib/peer-comparison";
import type { Layer3Metric, PeerComparison } from "@/lib/peer-comparison";

// PR #86 — Load the Dwellsy IQ wordmark from public/ at module
// load time and embed it as a data URL. Module-scope cache so
// warm lambdas reuse the base64 read on cold start. Same pattern
// as the OG image route (PR #80). Synchronous readFileSync is
// fine here because this happens once per lambda lifecycle, not
// per request.
let cachedLogoDataUrl: string | null = null;
function getLogoDataUrl(): string | null {
  if (cachedLogoDataUrl !== null) return cachedLogoDataUrl;
  try {
    const buf = readFileSync(
      join(process.cwd(), "public", "dwellsy-iq-logo.png")
    );
    cachedLogoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } catch (err) {
    console.error(
      "[scorecard-pdf] failed to load wordmark; falling back to text",
      err
    );
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

// Brand palette — mirrors src/app/globals.css CSS variables and
// the OG image color constants. Keeping these in sync across the
// brand surfaces (live scorecard, OG image, PDF) is what makes the
// share artifacts read as one product.
const COLOR_NAVY = "#0f1f3f";
const COLOR_TEAL = "#1b6e8c";
const COLOR_GOLD = "#E5A800";
const COLOR_SILVER = "#9CA3AF";
const COLOR_MUTED = "#5f6b80";
const COLOR_MUTED_2 = "#8b95a8";
const COLOR_GRID = "#e1e5ec";
const COLOR_SURFACE = "#f6f7fa";
const COLOR_BG = "#ffffff";
// Directional tones — mirror --color-good / --color-bad from
// globals.css so the Trajectory delta + Performance trend labels
// read the same green/red as the live report.
const COLOR_GOOD = "#3e7c3e";
const COLOR_BAD = "#a63a2a";
// Teal used for the peer-comparison IQR band + the sparkline stroke.
// The live components use #0E7C86 for the sparkline; we reuse the
// existing brand COLOR_TEAL (#1b6e8c) for consistency across the PDF.
const COLOR_TEAL_SOFT = "#d3e5eb";

// All-null peer-comparison map — the default when the API route
// couldn't build peer comparisons (msaPool load failed). Each null
// card renders the "Insufficient data" state, same as the live
// PerformanceLayer.
const EMPTY_PEER_COMPARISONS: Record<Layer3Metric, PeerComparison | null> = {
  dom: null,
  tenancy: null,
  rentPerformance: null,
  marketing: null,
  communityVisibility: null,
};

const styles = StyleSheet.create({
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

// --- Helpers (mirrored from the live components, kept here so
//     the PDF can be rendered from a single component without
//     reaching into JSX-only helpers) ---

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function fmtNumber(n: number, digits: number, signed = false): string {
  const sign = signed && n > 0 ? "+" : "";
  return sign + n.toFixed(digits);
}
function fmtPct(n: number, digits: number, signed = false): string {
  return `${fmtNumber(n, digits, signed)}%`;
}
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function classifyOperator(scorecard: ScorecardData): "sfr" | "mfbtr" | "hybrid" {
  const q = (scorecard.pm.quadrant7Cell ?? "").toLowerCase();
  if (q.startsWith("sfr")) return "sfr";
  if (q.startsWith("small mf") || q.startsWith("large mf")) return "mfbtr";
  if (q.startsWith("hybrid")) return "hybrid";
  const legacy = (scorecard.pm.quadrant ?? "").toLowerCase();
  if (legacy.includes("scattered")) return "sfr";
  if (legacy.includes("mf") || legacy.includes("btr")) return "mfbtr";
  return "hybrid";
}

// --- Sub-components ---

function StarChip({
  color,
  count,
  label,
}: {
  color: string;
  count: number;
  label: string;
}) {
  return (
    <View
      style={[
        styles.starChip,
        { borderColor: color, backgroundColor: color + "1a" },
      ]}
    >
      <Text style={[styles.starGlyph, { color }]}>★</Text>
      <Text style={styles.starChipText}>{count}</Text>
      <Text style={styles.starChipLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Tile({
  title,
  value,
  unit,
  star,
  compare,
}: {
  title: string;
  value: string;
  unit?: string;
  star?: StarLevel;
  compare?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileTitle}>{title}</Text>
      <View style={styles.tileValueRow}>
        <Text style={styles.tileValue}>{value}</Text>
        {unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
        {star === "gold" ? (
          <Text style={[styles.starGlyph, { color: COLOR_GOLD, marginLeft: 4 }]}>
            ★
          </Text>
        ) : star === "silver" ? (
          <Text style={[styles.starGlyph, { color: COLOR_SILVER, marginLeft: 4 }]}>
            ★
          </Text>
        ) : null}
      </View>
      {compare ? <Text style={styles.tileCompare}>{compare}</Text> : null}
    </View>
  );
}

function PageFooter({ scorecard }: { scorecard: ScorecardData }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Methodology {scorecard.methodologyVersion}
        {scorecard.designVersion ? ` · Design ${scorecard.designVersion}` : ""}
        {" · Data as of "}
        {fmtDate(scorecard.dataAsOf)}
      </Text>
      <Text>
        {/* Dynamic page numbering — the Trajectory page is conditional
            and the Performance page can overflow, so counting the
            actual rendered pages (via react-pdf's render callback) is
            the only way to keep "Page X of Y" correct. */}
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
        {" · "}
        <Text style={styles.footerLink}>iq.dwellsy.com</Text>
      </Text>
    </View>
  );
}

function PageHeader({
  scorecard,
  sectionTitle,
}: {
  scorecard: ScorecardData;
  sectionTitle: string;
}) {
  return (
    <View style={styles.pageHeader}>
      <View>
        <Text style={styles.pageHeaderTitle}>{scorecard.pm.name}</Text>
        <Text style={styles.pageHeaderMeta}>
          {scorecard.market.fullName ??
            `${scorecard.market.name}, ${scorecard.market.state}`}
        </Text>
      </View>
      <Text style={styles.pageHeaderMeta}>{sectionTitle}</Text>
    </View>
  );
}

// --- Geographic coverage map ---
//
// PR #85 — Replaces the prior "no charts/maps" PDF version. The
// map uses @react-pdf/renderer's native SVG primitives (no Mapbox,
// no headless browser — those don't work in a server PDF render
// path). Equirectangular projection is fine at MSA scale.

function GeographicCoverageMap({
  coverage,
  city,
  msaName,
}: {
  coverage: ScorecardData["geographicCoverage"];
  city: string;
  msaName: string;
}) {
  const points = coverage.coverageMapPoints ?? [];
  const backdrop = coverage.msaBackdropPoints ?? [];
  if (points.length === 0) {
    return (
      <Svg width={500} height={200} viewBox="0 0 880 380">
        <Rect x={0} y={0} width={880} height={380} fill="#F2F5F8" />
        <Circle cx={430} cy={195} r={22} fill="#D97834" fillOpacity={0.14} />
        <Circle cx={430} cy={195} r={9} fill="#D97834" stroke="#fff" strokeWidth={2.5} />
      </Svg>
    );
  }

  const MAP_W = 500;
  const MAP_H = 220;

  // Bounds: prefer explicit mapBounds, otherwise compute from
  // points + backdrop. Add 8% padding so points don't kiss the
  // SVG edge.
  let bounds = coverage.mapBounds;
  if (!bounds) {
    const allPoints = [...points, ...backdrop];
    const lats = allPoints.map((p) => p.lat);
    const lons = allPoints.map((p) => p.lon);
    bounds = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons),
    };
  }
  const latRange = Math.max(bounds.north - bounds.south, 0.01);
  const lonRange = Math.max(bounds.east - bounds.west, 0.01);
  const pad = 0.08;
  const padBounds = {
    north: bounds.north + latRange * pad,
    south: bounds.south - latRange * pad,
    east: bounds.east + lonRange * pad,
    west: bounds.west - lonRange * pad,
  };

  function project(lat: number, lon: number): { x: number; y: number } {
    const x =
      ((lon - padBounds.west) / (padBounds.east - padBounds.west)) * MAP_W;
    const y =
      (1 - (lat - padBounds.south) / (padBounds.north - padBounds.south)) *
      MAP_H;
    return { x, y };
  }

  function pointRadius(n: number): number {
    return Math.max(2, Math.min(6, 2 + Math.log10(Math.max(n, 1)) * 1.6));
  }

  // PR #87 — Map upgrade. Two issues from Jonas's PR #86 review:
  // (1) the previous version was just dots on a gray rectangle
  // with no geographic reference — viewers couldn't orient
  // themselves; (2) the empty white box in the top-right corner
  // (placeholder I forgot to remove) looked broken.
  //
  // Fix: derive city centroids from coverageMapPoints[].city and
  // overlay the top-N cities as labeled markers. The labels sit
  // above the dot cluster and give immediate "this is Chattanooga,
  // this is Rossville" orientation — turns the abstract dot cluster
  // into a recognizable map of the MSA.
  //
  // Labels rendered as positioned layout-text overlays (not SVG
  // <text>) because @react-pdf/renderer's SVG text rendering is
  // unreliable across versions; the absolute-positioning approach
  // is more predictable.

  // Group points by city → centroid map.
  const cityCentroids = new Map<
    string,
    { lat: number; lon: number; n: number }
  >();
  for (const p of points) {
    if (!p.city) continue;
    const cur = cityCentroids.get(p.city);
    if (cur) {
      const totalN = cur.n + p.n;
      cur.lat = (cur.lat * cur.n + p.lat * p.n) / totalN;
      cur.lon = (cur.lon * cur.n + p.lon * p.n) / totalN;
      cur.n = totalN;
    } else {
      cityCentroids.set(p.city, { lat: p.lat, lon: p.lon, n: p.n });
    }
  }
  // Top cities to label: prefer scorecard.geographicCoverage.topCities
  // (already ordered by share), fall back to alphabetical from the
  // centroids map.
  const topCityNames = coverage.topCities && coverage.topCities.length > 0
    ? coverage.topCities.slice(0, 5).map((c) => c.name)
    : Array.from(cityCentroids.keys()).slice(0, 5);
  const labels: Array<{ name: string; x: number; y: number }> = [];
  for (const name of topCityNames) {
    const c = cityCentroids.get(name);
    if (!c) continue;
    const { x, y } = project(c.lat, c.lon);
    labels.push({ name, x, y });
  }

  return (
    <View
      style={{
        position: "relative",
        width: MAP_W,
        height: MAP_H,
      }}
    >
      <Svg width={MAP_W} height={MAP_H}>
        <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#F2F5F8" />
        {points.map((p, i) => {
          const { x, y } = project(p.lat, p.lon);
          const r = pointRadius(p.n);
          // PR #87 — Dot opacity dialed back so the city labels
          // overlaid on top remain readable. The halo is still
          // visible enough to convey cluster density.
          return (
            <G key={i}>
              <Circle
                cx={x}
                cy={y}
                r={r * 2.2}
                fill={COLOR_TEAL}
                fillOpacity={0.12}
              />
              <Circle
                cx={x}
                cy={y}
                r={r}
                fill={COLOR_TEAL}
                fillOpacity={0.85}
                stroke="#ffffff"
                strokeWidth={0.8}
              />
            </G>
          );
        })}
      </Svg>
      {/* PR #87 — City labels positioned as overlays on top of the
          SVG. Each label gets a small white pill background so the
          name stays legible regardless of how dense the operator
          dots are underneath. */}
      {labels.map((label, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            // Center the label on its centroid; rough approximation
            // assuming ~6pt label width per char.
            left: Math.max(
              2,
              Math.min(MAP_W - label.name.length * 5 - 8, label.x - label.name.length * 2.5 - 4)
            ),
            top: Math.max(2, label.y - 8),
            backgroundColor: "#ffffff",
            paddingHorizontal: 4,
            paddingVertical: 1,
            borderRadius: 2,
            borderWidth: 0.5,
            borderColor: COLOR_GRID,
            borderStyle: "solid",
          }}
        >
          <Text
            style={{
              fontSize: 7.5,
              fontWeight: 700,
              color: COLOR_NAVY,
              fontFamily: "Helvetica-Bold",
            }}
          >
            {label.name}
          </Text>
        </View>
      ))}
      {/* MSA name in the bottom-right corner for grounding. */}
      <View
        style={{
          position: "absolute",
          right: 6,
          bottom: 6,
          backgroundColor: "#ffffff",
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 2,
        }}
      >
        <Text
          style={{
            fontSize: 7,
            color: COLOR_MUTED,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            fontFamily: "Helvetica-Bold",
          }}
        >
          {msaName}
        </Text>
      </View>
    </View>
  );
}

// --- Rent trajectory chart ---
//
// PR #85 — Bar + line chart for the 6-quarter mix-adjusted median
// rent series. Operator bars (navy) + optional cohort median line
// overlay (teal). When the API route loads msaPool, the cohort
// overlay is computed via buildCohortRentTrajectory and passed
// through here; without it, only operator bars render.

function RentTrajectoryChart({
  trajectory,
  cohortTrajectory,
}: {
  trajectory: ScorecardData["rentTrajectory"];
  cohortTrajectory: CohortRentTrajectory | null;
}) {
  if (!Array.isArray(trajectory) || trajectory.length === 0) return null;

  const CHART_W = 500;
  const CHART_H = 150;
  const PAD = { top: 8, right: 20, bottom: 18, left: 48 };
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const cohortByQuarter = new Map<string, number | null>();
  if (cohortTrajectory) {
    for (const p of cohortTrajectory.points) {
      cohortByQuarter.set(p.quarter, p.cohortMedian);
    }
  }
  const data = trajectory.map((t) => ({
    quarter: t.quarter,
    operator: t.mixAdjMedian,
    cohort: cohortByQuarter.get(t.quarter) ?? null,
  }));

  const allValues = data
    .flatMap((d) => [d.operator, d.cohort])
    .filter((v): v is number => v !== null && v > 0);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;
  const yMin = Math.max(0, minVal - range * 0.15);
  const yMax = maxVal + range * 0.15;

  const colWidth = innerW / data.length;
  const barWidth = colWidth * 0.5;

  function projectY(v: number): number {
    return PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  }

  // Y-axis ticks: 3 evenly-spaced gridlines (min, mid, max).
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  // Cohort line polyline points (skip quarters with null cohort).
  const cohortPoints = data
    .map((d, i) => {
      if (d.cohort === null) return null;
      const x = PAD.left + i * colWidth + colWidth / 2;
      const y = projectY(d.cohort);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((p): p is string => p !== null)
    .join(" ");

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Y-axis gridlines */}
        {yTicks.map((tick, i) => (
          <Line
            key={`grid-${i}`}
            x1={PAD.left}
            y1={projectY(tick)}
            x2={CHART_W - PAD.right}
            y2={projectY(tick)}
            stroke={COLOR_GRID}
            strokeWidth={0.6}
          />
        ))}

        {/* Operator bars */}
        {data.map((d, i) => {
          const x = PAD.left + i * colWidth + (colWidth - barWidth) / 2;
          const y = projectY(d.operator);
          const h = projectY(yMin) - y;
          return (
            <Rect
              key={`bar-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={COLOR_NAVY}
            />
          );
        })}

        {/* Cohort line + dots */}
        {cohortPoints && (
          <Polyline
            points={cohortPoints}
            fill="none"
            stroke={COLOR_TEAL}
            strokeWidth={2}
          />
        )}
        {data.map((d, i) => {
          if (d.cohort === null) return null;
          const x = PAD.left + i * colWidth + colWidth / 2;
          const y = projectY(d.cohort);
          return (
            <Circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={2.5}
              fill={COLOR_TEAL}
              stroke="#ffffff"
              strokeWidth={0.8}
            />
          );
        })}
      </Svg>

      {/* X-axis labels + Y-axis range. Rendered as layout text
          below/beside the SVG so the SVG element stays simple
          (font handling differs between SVG <Text> and layout
          <Text> in @react-pdf/renderer; layout text is more
          reliable). */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          paddingLeft: PAD.left,
          paddingRight: PAD.right,
          marginTop: 2,
        }}
      >
        {data.map((d, i) => (
          <Text
            key={`xlabel-${i}`}
            style={{
              fontSize: 7,
              color: COLOR_MUTED_2,
              flex: 1,
              textAlign: "center",
            }}
          >
            {d.quarter}
          </Text>
        ))}
      </View>

      {/* Y-axis range hint as a one-liner under the chart */}
      <Text
        style={{
          fontSize: 7,
          color: COLOR_MUTED_2,
          marginTop: 4,
          textAlign: "left",
        }}
      >
        {`Y-axis: $${fmtInt(yMin)} – $${fmtInt(yMax)} per month`}
      </Text>

      {/* Chart legend */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 14,
          marginTop: 6,
        }}
      >
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <View
            style={{ width: 9, height: 9, backgroundColor: COLOR_NAVY }}
          />
          <Text style={{ fontSize: 8, color: COLOR_MUTED }}>Operator</Text>
        </View>
        {cohortTrajectory && (
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <View
              style={{ width: 12, height: 2, backgroundColor: COLOR_TEAL }}
            />
            <Text style={{ fontSize: 8, color: COLOR_MUTED }}>
              {`${cohortTrajectory.cohortName} median`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// --- Per-metric content helpers (text only — chart elements skipped) ---

function leaseUpDetail(scorecard: ScorecardData): {
  value: string;
  unit: string;
  star: StarLevel;
  compare: string;
} {
  const p = scorecard.performance;
  const peerMedian = p.peerQuadrantDomT12 ?? p.marketDomT12;
  const delta = p.domT12 - peerMedian;
  // PR #86 — Replaced ▼ ▲ Unicode arrows with plain text +/-/text.
  // Helvetica (the default PDF font) doesn't have those glyphs and
  // was rendering them as fallback chars (¼ ²) in the post-PR-85
  // PDF output. Plain "Xd faster"/"Xd slower" reads cleanly across
  // any PDF viewer.
  const compare = Number.isFinite(peerMedian)
    ? Math.abs(delta) < 0.05
      ? `vs cohort median ${fmtNumber(peerMedian, 1)} days`
      : `${fmtNumber(Math.abs(delta), 1)}d ${delta < 0 ? "faster than" : "slower than"} cohort (${fmtNumber(peerMedian, 1)}d)`
    : `n = ${p.domT12N} listings (T12)`;
  return {
    value: fmtNumber(p.domT12, 1),
    unit: "days",
    star: p.domStar ?? null,
    compare,
  };
}

function tenancyDetail(scorecard: ScorecardData): {
  value: string;
  unit: string;
  star: StarLevel;
  compare: string;
} {
  const t = scorecard.tenancy;
  const cohortMedian = t.apartment.cohortP50 ?? t.house.cohortP50 ?? null;
  // PR #86 — same Helvetica-glyph fix as leaseUpDetail. Tenant
  // retention longer than cohort = favorable (▲ in live page);
  // shorter = unfavorable (▼). Plain text reads cleanly in PDF.
  const compare =
    t.overallGap !== null && cohortMedian !== null
      ? `${fmtNumber(Math.abs(t.overallGap - cohortMedian), 1)}mo ${t.overallGap > cohortMedian ? "longer than" : "shorter than"} cohort (${fmtNumber(cohortMedian, 1)}mo)`
      : t.overallGap !== null
        ? `${t.totalUnits} units observed`
        : "Insufficient data";
  return {
    value: t.overallGap !== null ? fmtNumber(t.overallGap, 1) : "—",
    unit: "mo median",
    star: t.star ?? null,
    compare,
  };
}

function rentDetail(scorecard: ScorecardData): {
  value: string;
  unit: string;
  star: StarLevel;
  compare: string;
} {
  const rp = scorecard.rentPerformance;
  if (!rp) {
    return { value: "—", unit: "", star: null, compare: "Insufficient data" };
  }
  const deltaPp = (rp.delta ?? 0) * 100;
  const operatorLine = `Operator: ${fmtPct(rp.pmYoyChange * 100, 1, true)} YoY`;
  const cohortLine =
    rp.cohortMedianYoyChange !== null
      ? `Cohort median: ${fmtPct((rp.cohortMedianYoyChange ?? 0) * 100, 1, true)} YoY`
      : "";
  return {
    value: `${deltaPp > 0 ? "+" : ""}${fmtNumber(deltaPp, 1)}`,
    unit: "pp vs cohort",
    star: rp.star ?? null,
    compare: cohortLine ? `${operatorLine}  ·  ${cohortLine}` : operatorLine,
  };
}

function marketingDetail(scorecard: ScorecardData): {
  value: string;
  unit: string;
  star: StarLevel;
  compare: string;
} {
  const m = scorecard.marketing;
  if (marketingDataSuppressed(m)) {
    return {
      value: "—",
      unit: "",
      star: null,
      compare: "Insufficient marketing data for this cohort",
    };
  }
  const pct = scorecard.rank.percentiles.marketing;
  return {
    value: fmtNumber(m.compositeScore, 0),
    unit: "/ 100",
    star: m.star ?? null,
    compare:
      pct !== null
        ? `${Math.round(pct)}th percentile in cohort`
        : "Composite marketing quality",
  };
}

function inventoryTransparencyDetail(
  scorecard: ScorecardData
): { value: string; unit: string; star: StarLevel; compare: string } | null {
  const cv = scorecard.communityVisibility;
  if (!cv) return null;
  return {
    value: fmtNumber(cv.ratio, 2),
    unit: "ratio",
    star: cv.star ?? null,
    compare: cv.stateLabel,
  };
}

function portfolioTile(scorecard: ScorecardData): {
  value: string;
  unit: string;
  star: StarLevel;
  compare: string;
} {
  const est = scorecard.portfolioEstimate;
  if (!est) {
    return {
      value: "—",
      unit: "",
      star: null,
      compare: "No estimate available",
    };
  }
  if (est.status === "estimated" && typeof est.point === "number") {
    const range =
      typeof est.low === "number" && typeof est.high === "number"
        ? `${fmtInt(est.low)}–${fmtInt(est.high)} units`
        : "Point estimate";
    const confidence = est.confidence
      ? `${est.confidence} confidence${est.cohort ? ` · ${est.cohort}` : ""}`
      : "";
    return {
      value: fmtInt(est.point),
      unit: "units",
      star: null,
      compare: confidence ? `${range}  ·  ${confidence}` : range,
    };
  }
  return {
    value: "—",
    unit: "",
    star: null,
    compare: est.message ?? "Insufficient data",
  };
}

// --- Lending signals helpers ---
//
// PR #86 — Replaces the prior "2 directly-stored signals only"
// approach. The API route now loads msaPool + marketFootprint and
// calls buildLendingSignals, producing the full 5-signal output.
// Each signal gets its own narrative function below that mirrors
// the live page's LendingSignals component layout.

// PR #87 — MetricCardData replaces the old SignalCardData. Same
// underlying job (title + descriptor for a card), but now carries
// the headline value + unit explicitly so the renderer can give
// the metric visual prominence (PerformanceCard-style two-column
// layout). Jonas's review on PR #86 noted Pages 3 and 5 buried
// the metric inside a narrative sentence — this fixes that.
interface MetricCardData {
  title: string;
  /** Big headline value rendered in large type on the right.
   *  Format the value (currency, percent, etc.) here — the renderer
   *  just stringifies it. */
  value: string;
  /** Smaller unit/label stacked below the value (e.g., "%", "days",
   *  "/mo", "years"). Optional — bare-number metrics omit this. */
  valueUnit?: string;
  /** Narrative context that explains the metric (cohort comparison,
   *  caveat, methodology hint). Rendered as muted body text below
   *  the title. */
  context: string;
  /** Star tier, when this signal carries one. Rendered next to the
   *  big value. */
  star?: StarLevel;
}

function vacancySignalCard(v: VacancySignal): MetricCardData {
  if (v.vacancyPct === null) {
    return {
      title: "Vacancy Signal",
      value: "—",
      context:
        "Insufficient DOM or tenancy data to compute vacancy ratio for this operator.",
      star: null,
    };
  }
  return {
    title: "Vacancy Signal",
    value: fmtNumber(v.vacancyPct, 1),
    valueUnit: "%",
    star: v.star,
    context:
      "Estimated cycle vacancy. Derived from lease-up speed and tenant retention. Lower indicates less downtime between tenancies.",
  };
}

function rentStabilitySignalCard(rs: RentStabilitySignal): MetricCardData {
  if (rs.suppressed) {
    return {
      title: "Rent Stability",
      value: "—",
      context:
        rs.reason ?? "Insufficient rent observation history for this operator.",
      star: rs.star,
    };
  }
  const contextParts: string[] = [];
  if (rs.cohortMedianVolatility !== null) {
    contextParts.push(
      `Cohort median volatility ${fmtNumber(rs.cohortMedianVolatility, 1)}pp`
    );
  }
  contextParts.push(`${fmtNumber(rs.yearsOfHistory, 1)}-year observation window`);
  return {
    title: "Rent Stability",
    value: rs.volatilityPP !== null ? fmtNumber(rs.volatilityPP, 1) : "—",
    valueUnit: "pp volatility",
    star: rs.star,
    context: contextParts.join("  ·  ") + ".",
  };
}

function operatorStabilitySignalCard(
  os: OperatorStabilitySignal
): MetricCardData {
  if (os.yearsVisible === null) {
    return {
      title: "Operator Stability",
      value: "—",
      context: "Not yet observable in our data.",
      star: os.star,
    };
  }
  const marketsLine =
    os.marketCount > 1
      ? `${os.marketCount} markets observed`
      : "Single-market operator";
  return {
    title: "Operator Stability",
    value: fmtNumber(os.yearsVisible, 1),
    valueUnit: "years visible",
    star: os.star,
    context: `${marketsLine}. Longer observation history = lower model-error risk for credit decisions.`,
  };
}

function geographicConcentrationSignalCard(
  gc: GeographicConcentrationSignal
): MetricCardData {
  // PR #86 — gc.top3CityShare and cohortMedianTop3 are stored as
  // decimals (0.76 = 76%), so multiply for display.
  const labels = {
    more_concentrated: "more concentrated than cohort",
    near_cohort: "near cohort median",
    more_dispersed: "more dispersed than cohort",
  } as const;
  return {
    title: "Geographic Concentration",
    value: `${Math.round(gc.top3CityShare * 100)}`,
    valueUnit: "% top-3 share",
    context: `Cohort median top-3 share ${Math.round(gc.cohortMedianTop3 * 100)}%  ·  ${labels[gc.positionIndicator]}.`,
    star: null,
  };
}

function pricingTierSignalCard(pt: PricingTierSignal): MetricCardData {
  if (pt.tier === null || pt.operatorRent === null) {
    return {
      title: "Pricing Tier",
      value: "—",
      context: "Insufficient rent data to classify pricing tier.",
      star: null,
    };
  }
  const tierLabels = {
    premium: "Premium tier",
    "mid-market": "Mid-market tier",
    value: "Value tier",
  } as const;
  const contextParts: string[] = [`${tierLabels[pt.tier]}`];
  if (pt.percentile !== null) {
    contextParts.push(
      `${Math.round(pt.percentile)}th percentile in MSA rent distribution`
    );
  }
  if (pt.msaP25 !== null && pt.msaP75 !== null) {
    contextParts.push(`MSA P25–P75: $${fmtInt(pt.msaP25)}–$${fmtInt(pt.msaP75)}`);
  }
  return {
    title: "Pricing Tier",
    value: `$${fmtInt(pt.operatorRent)}`,
    valueUnit: "operator median / mo",
    context: contextParts.join("  ·  ") + ".",
    star: null,
  };
}

function lendingSignalCards(
  scorecard: ScorecardData,
  resolved: LendingSignals | null
): MetricCardData[] {
  // Prefer the full resolved signals when the API route provided
  // them (post-PR-#86). Fall back to the 2-signal stored set if
  // not, so older calls still render something. The stored types
  // are slightly looser than the buildLendingSignals output (no
  // `kind` discriminator, optional cohortMedianVolatility), so we
  // adapt them explicitly here.
  if (!resolved) {
    const signals: MetricCardData[] = [];
    const ls = scorecard.lendingSignals;
    if (ls?.rentStability) {
      signals.push(
        rentStabilitySignalCard({
          kind: "rentStability",
          volatilityPP: ls.rentStability.volatilityPP,
          cohortMedianVolatility:
            ls.rentStability.cohortMedianVolatility ?? null,
          yearsOfHistory: ls.rentStability.yearsOfHistory,
          suppressed: ls.rentStability.suppressed,
          reason: ls.rentStability.reason,
          star: ls.rentStability.star,
        })
      );
    }
    if (ls?.geographicConcentration) {
      signals.push(
        geographicConcentrationSignalCard({
          kind: "geographicConcentration",
          top3CityShare: ls.geographicConcentration.top3CityShare,
          cohortMedianTop3: ls.geographicConcentration.cohortMedianTop3,
          positionIndicator: ls.geographicConcentration.linearPositionIndicator,
          cohortLevel: ls.geographicConcentration.cohortLevel,
        })
      );
    }
    return signals;
  }
  const signals: MetricCardData[] = [];
  if (resolved.vacancy) signals.push(vacancySignalCard(resolved.vacancy));
  if (resolved.rentStability)
    signals.push(rentStabilitySignalCard(resolved.rentStability));
  if (resolved.operatorStability)
    signals.push(operatorStabilitySignalCard(resolved.operatorStability));
  if (resolved.geographicConcentration)
    signals.push(
      geographicConcentrationSignalCard(resolved.geographicConcentration)
    );
  if (resolved.pricingTier)
    signals.push(pricingTierSignalCard(resolved.pricingTier));
  return signals;
}

// =====================================================================
//  Enriched Performance page — mirrors PerformanceLayer.tsx
// =====================================================================
//
// PR (full parity) — the Page-2 Performance page now carries the same
// analytical content as the live PerformanceLayer: per-card sample
// size (n), a P25/median/P75 distribution band with a focal marker,
// and a nearest-peers mini-table (name + value + mini-bar). Driven by
// the peerComparisons the API route computes via buildPeerComparisons.

interface PerfCardConfig {
  metric: Layer3Metric;
  title: string;
  headline: (v: number) => { value: string; unit: string };
  rowFormat: (v: number) => string;
  /** short axis noun used on the distribution endpoints (e.g. "DOM"). */
  axisLabel: string;
  definition: string;
}

// Mirrors SHARED_CARDS + INVENTORY_TRANSPARENCY_CARD in
// PerformanceLayer.tsx (titles, formats, definitions all identical).
const PERF_CARDS: PerfCardConfig[] = [
  {
    metric: "dom",
    title: "Lease-up Performance",
    headline: (v) => ({ value: fmtNumber(v, 1), unit: "days median DOM" }),
    rowFormat: (v) => `${fmtNumber(v, 1)} d`,
    axisLabel: "DOM",
    definition:
      "Lease-up Performance measures the median days a listing sits between activation and lease in trailing 12 months.",
  },
  {
    metric: "tenancy",
    title: "Tenant Retention",
    headline: (v) => ({ value: fmtNumber(v, 1), unit: "months median tenancy" }),
    rowFormat: (v) => `${fmtNumber(v, 1)} mo`,
    axisLabel: "tenancy",
    definition:
      "Tenant Retention measures the median time between successive listings of the same unit — a proxy for how long the average tenant stays.",
  },
  {
    metric: "rentPerformance",
    title: "Rent Performance",
    headline: (v) => ({
      value: `${v > 0 ? "+" : ""}${fmtNumber(v * 100, 1)}`,
      unit: "pp vs cohort YoY",
    }),
    rowFormat: (v) => `${v > 0 ? "+" : ""}${fmtNumber(v * 100, 1)}pp`,
    axisLabel: "rent delta",
    definition:
      "Rent Performance measures the operator's mix-adjusted YoY rent change against the cohort median for the same period.",
  },
  {
    metric: "marketing",
    title: "Marketing Discipline",
    headline: (v) => ({ value: fmtNumber(v, 0), unit: "/ 100 marketing quality" }),
    rowFormat: (v) => `${fmtNumber(v, 0)} / 100`,
    axisLabel: "marketing score",
    definition:
      "Marketing Discipline measures listing completeness, amenity disclosure, description depth, and photo coverage on a 0-100 composite.",
  },
];

const PERF_INVENTORY_CARD: PerfCardConfig = {
  metric: "communityVisibility",
  title: "Inventory Transparency",
  headline: (v) => ({ value: fmtNumber(v, 2), unit: "visibility ratio" }),
  rowFormat: (v) => fmtNumber(v, 2),
  axisLabel: "ratio",
  definition:
    "Inventory Transparency measures observed listings against expected turnover for known MF/BTR community sizes — a ratio of what we see vs. what we'd expect at typical turnover.",
};

// fmtNumber above (module helper) takes (n, digits, signed?) — the
// peer-comparison rowFormats call it with (v, digits) which matches.

// Direction-aware trend label, mirroring trendArrowFor in
// PerformanceLayer.tsx (favorable = green, unfavorable = red).
function perfTrend(
  metric: Layer3Metric,
  comparison: PeerComparison
): { label: string; color: string } | null {
  if (comparison.focalValue === null || comparison.cohortMedian === null) {
    return null;
  }
  const delta = comparison.focalValue - comparison.cohortMedian;
  if (Math.abs(delta) < 1e-6) {
    return { label: "at cohort median", color: COLOR_MUTED };
  }
  const direction = METRIC_DIRECTIONS[metric];
  const favorable = direction === "higher_better" ? delta > 0 : delta < 0;
  // Plain "+/-" prefix instead of ▲/▼ (Helvetica lacks those glyphs
  // in the PDF font — same fix as leaseUpDetail's arrow removal).
  const sign = delta > 0 ? "+" : "-";
  let magnitude = "";
  if (metric === "rentPerformance") {
    magnitude = `${fmtNumber(Math.abs(delta) * 100, 1)} pp vs cohort`;
  } else if (metric === "marketing") {
    magnitude = `${fmtNumber(Math.abs(delta), 0)} pts vs cohort`;
  } else if (metric === "communityVisibility") {
    magnitude = `${fmtNumber(Math.abs(delta), 2)} vs cohort`;
  } else if (metric === "tenancy") {
    magnitude = `${fmtNumber(Math.abs(delta), 1)} mo vs cohort`;
  } else {
    magnitude = `${fmtNumber(Math.abs(delta), 1)} d vs cohort`;
  }
  return {
    label: `${sign}${magnitude}`,
    color: favorable ? COLOR_GOOD : COLOR_BAD,
  };
}

// P25/median/P75 distribution band drawn with react-pdf SVG. Track +
// teal IQR band + median tick + navy focal marker — the react-pdf
// analogue of PerformanceLayer's DistributionChart.
function PerfDistribution({
  comparison,
  cfg,
}: {
  comparison: PeerComparison;
  cfg: PerfCardConfig;
}) {
  if (
    comparison.cohortP25 === null ||
    comparison.cohortP75 === null ||
    comparison.cohortMedian === null ||
    comparison.focalValue === null
  ) {
    return (
      <Text style={styles.perfDistCaption}>Distribution unavailable</Text>
    );
  }
  const W = 300;
  const H = 26;
  const cy = H / 2;
  const values = comparison.rows.map((r) => r.value);
  const minV = Math.min(comparison.cohortP25, comparison.focalValue, ...values);
  const maxV = Math.max(comparison.cohortP75, comparison.focalValue, ...values);
  const span = maxV - minV || 1;
  const pad = span * 0.08;
  const lo = minV - pad;
  const hi = maxV + pad;
  const total = hi - lo || 1;
  const posX = (v: number) => ((v - lo) / total) * W;
  const p25x = posX(comparison.cohortP25);
  const p75x = posX(comparison.cohortP75);
  const medx = posX(comparison.cohortMedian);
  const focx = posX(comparison.focalValue);
  const direction = METRIC_DIRECTIONS[cfg.metric];
  return (
    <View>
      <Svg width={W} height={H}>
        {/* Track */}
        <Rect x={0} y={cy - 2} width={W} height={4} rx={2} fill={COLOR_GRID} />
        {/* IQR band */}
        <Rect
          x={Math.min(p25x, p75x)}
          y={cy - 2}
          width={Math.max(1, Math.abs(p75x - p25x))}
          height={4}
          rx={2}
          fill={COLOR_TEAL_SOFT}
        />
        {/* Median tick */}
        <Rect x={medx - 1} y={cy - 6} width={2} height={12} fill={COLOR_TEAL} />
        {/* Focal marker */}
        <Circle
          cx={focx}
          cy={cy}
          r={5}
          fill={COLOR_BG}
          stroke={COLOR_NAVY}
          strokeWidth={2}
        />
      </Svg>
      <Text style={styles.perfDistCaption}>
        {`Cohort IQR — P25 ${cfg.rowFormat(comparison.cohortP25)} · median ${cfg.rowFormat(comparison.cohortMedian)} · P75 ${cfg.rowFormat(comparison.cohortP75)}`}
      </Text>
      <Text style={styles.perfDistCaption}>
        {direction === "lower_better"
          ? `Left = faster ${cfg.axisLabel}, right = slower`
          : `Left = lower ${cfg.axisLabel}, right = higher`}
      </Text>
    </View>
  );
}

// Nearest-peers mini-table: name + value + a mini value-bar, mirroring
// PerformanceLayer's PeerTable. Focal row is tinted + labelled.
function PerfPeerTable({
  comparison,
  cfg,
}: {
  comparison: PeerComparison;
  cfg: PerfCardConfig;
}) {
  if (comparison.rows.length === 0) return null;
  const values = comparison.rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const direction = METRIC_DIRECTIONS[cfg.metric];
  const BAR_W = 120;
  return (
    <View style={{ marginTop: 4 }}>
      {comparison.rows.map((row) => {
        const ratio = (row.value - min) / span;
        const fillPct =
          direction === "higher_better" ? ratio : 1 - ratio;
        const fillW = Math.max(3, fillPct * BAR_W);
        return (
          <View
            key={row.slug}
            style={[
              styles.peerRow,
              row.isFocal ? { backgroundColor: COLOR_TEAL_SOFT } : {},
            ]}
          >
            {/* Star glyph */}
            <Text
              style={{
                width: 10,
                fontSize: 9,
                color:
                  row.star === "gold"
                    ? COLOR_GOLD
                    : row.star === "silver"
                      ? COLOR_SILVER
                      : "transparent",
              }}
            >
              ★
            </Text>
            {/* Name (focal is bold) */}
            <Text
              style={[
                styles.peerName,
                { flex: 2 },
                row.isFocal
                  ? { fontFamily: "Helvetica-Bold", fontWeight: 700 }
                  : {},
              ]}
            >
              {row.isFocal ? `${row.name} (this operator)` : row.name}
            </Text>
            {/* Mini value-bar */}
            <View style={{ width: BAR_W }}>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: COLOR_GRID,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: direction === "lower_better" ? BAR_W - fillW : 0,
                  height: 4,
                  width: fillW,
                  borderRadius: 2,
                  backgroundColor: row.isFocal ? COLOR_NAVY : COLOR_TEAL,
                }}
              />
            </View>
            {/* Value */}
            <Text
              style={[
                styles.peerValue,
                { width: 58 },
                row.isFocal
                  ? { fontFamily: "Helvetica-Bold", fontWeight: 700 }
                  : {},
              ]}
            >
              {cfg.rowFormat(row.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// Single enriched performance card.
function EnrichedPerformanceCard({
  scorecard,
  cfg,
  comparison,
}: {
  scorecard: ScorecardData;
  cfg: PerfCardConfig;
  comparison: PeerComparison | null;
}) {
  // Tenancy short-history caveat — mirrors PerformanceLayer's footnote.
  const tenancyCaveat =
    cfg.metric === "tenancy" &&
    scorecard.tenancy.shortHistoryFlag === true &&
    scorecard.tenancy.yearsVisible !== undefined
      ? `Tenancy estimate may be biased low for operators with shorter observation history. ${scorecard.pm.name} has been observed in our data for ${fmtNumber(scorecard.tenancy.yearsVisible, 1)} years.`
      : null;
  const footnote = [comparison?.footnote, tenancyCaveat]
    .filter(Boolean)
    .join(" ");

  // No comparison / no focal value → header + insufficient-data line,
  // keeping the structural cadence consistent (matches the live page).
  if (!comparison || comparison.focalValue === null) {
    return (
      <View style={styles.perfCard} wrap={false}>
        <View style={styles.perfCardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.perfCardTitle}>{cfg.title}</Text>
            {comparison ? (
              <Text style={styles.perfCardQualifier}>
                {`${comparison.cohortName} · n = ${comparison.cohortN}`}
              </Text>
            ) : null}
            {footnote ? (
              <Text style={styles.perfFootnote}>{footnote}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.perfContext}>
          {`Insufficient data to compute ${cfg.title.toLowerCase()} for this operator.`}
        </Text>
      </View>
    );
  }

  const headline = cfg.headline(comparison.focalValue);
  const trend = perfTrend(cfg.metric, comparison);
  const star = comparison.focalStar;
  const qualifier =
    star === "gold"
      ? "Gold star · Top quartile in cohort"
      : star === "silver"
        ? "Silver star · Above median in cohort"
        : null;

  return (
    <View style={styles.perfCard} wrap={false}>
      {/* Header: title + qualifier + n */}
      <View style={styles.perfCardHeaderRow}>
        <View style={{ flex: 1 }}>
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Text style={styles.perfCardTitle}>{cfg.title}</Text>
            {star === "gold" && (
              <Text style={[styles.starGlyph, { color: COLOR_GOLD }]}>★</Text>
            )}
            {star === "silver" && (
              <Text style={[styles.starGlyph, { color: COLOR_SILVER }]}>★</Text>
            )}
          </View>
          <Text style={styles.perfCardQualifier}>
            {qualifier ? `${qualifier} · ` : ""}
            {`${comparison.cohortName} · n = ${comparison.cohortN}`}
          </Text>
          {footnote ? (
            <Text style={styles.perfFootnote}>{footnote}</Text>
          ) : null}
        </View>
      </View>

      {/* Headline value + trend, alongside the distribution band */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 10,
        }}
      >
        <View style={{ width: 150 }}>
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              gap: 6,
            }}
          >
            <Text style={styles.perfHeadlineValue}>{headline.value}</Text>
            {trend && (
              <Text style={[styles.perfTrend, { color: trend.color }]}>
                {trend.label}
              </Text>
            )}
          </View>
          {headline.unit ? (
            <Text style={styles.perfHeadlineUnit}>{headline.unit}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <PerfDistribution comparison={comparison} cfg={cfg} />
        </View>
      </View>

      {/* Peer comparison mini-table */}
      <Text style={styles.perfEyebrowMuted}>
        {`How peers compare in ${comparison.cohortName}`}
      </Text>
      <PerfPeerTable comparison={comparison} cfg={cfg} />

      {/* Factual context sentence (mirrors the live definition line) */}
      <Text style={styles.perfContext}>
        {cfg.definition} {scorecard.pm.name}
        {`'s value of ${cfg.rowFormat(comparison.focalValue)}`}
        {comparison.cohortMedian !== null
          ? ` compares to the ${comparison.cohortName} median of ${cfg.rowFormat(comparison.cohortMedian)}.`
          : "."}
      </Text>
    </View>
  );
}

// =====================================================================
//  Trajectory page — mirrors OperatorTrajectorySection.tsx
// =====================================================================
//
// PR (full parity) — hand-rolled react-pdf SVG sparkline of the est.-
// portfolio series over time + a newest-first per-snapshot table.
// Thin history (1 snapshot) collapses to a "first tracked" line. Zero
// snapshots → the caller skips the page entirely.

function TrajectoryPageBody({
  trajectory,
}: {
  trajectory: OperatorTrajectory;
}) {
  const summary = summarizeTrajectory(trajectory);

  if (summary.pointCount === 1) {
    return (
      <>
        <Text style={[styles.paragraph, { marginTop: 12 }]}>
          {"First tracked "}
          <Text style={{ fontFamily: "Helvetica-Bold", fontWeight: 700 }}>
            {summary.firstDate ? fmtDate(summary.firstDate) : "recently"}
          </Text>
          {". A trend builds with each monthly refresh."}
        </Text>
        <TrajectoryFooterLine summary={summary} />
      </>
    );
  }

  return (
    <>
      {summary.hasTrend && (
        <TrajectorySparkline trajectory={trajectory} summary={summary} />
      )}
      <TrajectorySnapshotTable trajectory={trajectory} />
      <TrajectoryFooterLine summary={summary} />
    </>
  );
}

function TrajectorySparkline({
  trajectory,
  summary,
}: {
  trajectory: OperatorTrajectory;
  summary: ReturnType<typeof summarizeTrajectory>;
}) {
  const W = 500;
  const H = 90;
  const PAD = 8;
  const spark = buildSparkline(trajectory.points, W, H, PAD);
  if (spark.length === 0) return null;
  const polyline = spark.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const delta = summary.netPortfolioDelta;
  const deltaColor =
    delta === null || delta === 0
      ? COLOR_NAVY
      : delta > 0
        ? COLOR_GOOD
        : COLOR_BAD;
  const deltaLabel =
    delta === null
      ? null
      : `${delta > 0 ? "+" : delta < 0 ? "-" : "±"}${fmtInt(Math.abs(delta))} units since ${
          summary.firstDate ? fmtDate(summary.firstDate) : "tracking began"
        }`;

  return (
    <View>
      {/* Headline: latest estimate + net change */}
      <View style={styles.trajectoryHeadlineRow}>
        <Text style={styles.trajectoryHeadlineEyebrow}>Est. portfolio</Text>
        <Text style={styles.trajectoryHeadlineValue}>
          {summary.lastPortfolio !== null ? fmtInt(summary.lastPortfolio) : "—"}
        </Text>
        {deltaLabel && (
          <Text style={[styles.trajectoryDelta, { color: deltaColor }]}>
            {deltaLabel}
          </Text>
        )}
      </View>

      {/* Sparkline — oldest left → newest right */}
      <View style={{ marginTop: 10 }}>
        <Svg width={W} height={H}>
          <Polyline
            points={polyline}
            fill="none"
            stroke={COLOR_TEAL}
            strokeWidth={2}
          />
          {spark.map((p) => (
            <Circle key={p.date} cx={p.x} cy={p.y} r={2.5} fill={COLOR_TEAL} />
          ))}
        </Svg>
      </View>

      {/* Axis endpoint labels under the chart */}
      <View style={styles.trajectoryAxisRow}>
        <Text style={styles.trajectoryAxisLabel}>
          {fmtDate(spark[0].date)}
        </Text>
        {/* Guillemet, not an arrow — Helvetica's built-in glyph set
            (no custom font registered) lacks →, which would render as a
            blank box; » is in the standard set. */}
        <Text style={styles.trajectoryAxisCenter}>OLDER » NEWER</Text>
        <Text style={styles.trajectoryAxisLabel}>
          {fmtDate(spark[spark.length - 1].date)}
        </Text>
      </View>
    </View>
  );
}

function TrajectorySnapshotTable({
  trajectory,
}: {
  trajectory: OperatorTrajectory;
}) {
  // Newest-first (reverse the ascending points).
  const rows: TrajectoryPoint[] = [...trajectory.points].reverse();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Refresh</Text>
        <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>
          Est. portfolio
        </Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          Gold
        </Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          Silver
        </Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          Ranked
        </Text>
      </View>
      {rows.map((p) => (
        <View key={p.date} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{fmtDate(p.date)}</Text>
          <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>
            {p.portfolioPoint !== null ? fmtInt(p.portfolioPoint) : "—"}
          </Text>
          <Text style={[styles.tableCellMuted, { flex: 1, textAlign: "right" }]}>
            {p.goldCount}
          </Text>
          <Text style={[styles.tableCellMuted, { flex: 1, textAlign: "right" }]}>
            {p.silverCount}
          </Text>
          <Text style={[styles.tableCellMuted, { flex: 1, textAlign: "right" }]}>
            {p.eligible ? "Yes" : "No"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TrajectoryFooterLine({
  summary,
}: {
  summary: ReturnType<typeof summarizeTrajectory>;
}) {
  return (
    <Text style={styles.trajectoryFooter}>
      {`Tracked since ${summary.firstDate ? fmtDate(summary.firstDate) : "—"} · ${summary.pointCount} ${summary.pointCount === 1 ? "snapshot" : "snapshots"} · modeled on current methodology.`}
    </Text>
  );
}

// =====================================================================
//  Methodology tables — mirror MethodologyFooter.tsx
// =====================================================================
//
// PR (full parity) — ported react-pdf tables for coverage parameters,
// portfolio composition, and per-metric sample sizes.

function MethodologyCoverageTable({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const c = scorecard.coverage;
  const rows: Array<{ label: string; value: string }> = [
    { label: "First observed listing", value: fmtDate(c.firstListing) },
    { label: "Months on platform", value: fmtInt(c.monthsOnPlatform) },
    { label: "Listings — lifetime", value: fmtInt(c.lifetimeListings) },
    { label: "Listings — T12", value: fmtInt(c.t12Listings) },
  ];
  if (c.t6Listings !== null) {
    rows.push({ label: "Listings — T6", value: fmtInt(c.t6Listings) });
  }
  rows.push({
    label: "URUs — lifetime / T12",
    value: `${fmtInt(c.urusLifetime)} / ${fmtInt(c.urusT12)}`,
  });
  rows.push({ label: "Active inventory", value: fmtInt(c.activeListings) });
  rows.push({ label: "Data tier", value: c.dataTier });
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.perfEyebrowMuted}>Coverage parameters</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Parameter</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          Value
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{r.label}</Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MethodologyPortfolioTable({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const c = scorecard.coverage;
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Observed managed units · this MSA",
      value: fmtInt(c.totalObservedUnits),
    },
  ];
  if (c.nationalObservedUnitsT12 !== null) {
    rows.push({
      label: "Observed units · all markets (T12)",
      value: fmtInt(c.nationalObservedUnitsT12),
    });
  }
  rows.push({ label: "Cities observed", value: fmtInt(c.citiesObserved) });
  if (c.concentratedShare !== null) {
    rows.push({
      label: "Share in concentrated communities (≥10 units)",
      value: fmtPct(c.concentratedShare * 100, 0),
    });
  }
  if (c.observedCommunityTotalUnits !== undefined) {
    rows.push({
      label: "Observed community totals (top-down)",
      value: fmtInt(c.observedCommunityTotalUnits),
    });
  }
  rows.push({
    label: "7-cell classification",
    value: scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant ?? "—",
  });
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.perfEyebrowMuted}>Portfolio composition</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Signal</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          Value
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{r.label}</Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MethodologySampleSizeTable({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const c = scorecard.coverage;
  const t = scorecard.tenancy;
  const rows: Array<{ metric: string; n: string; note: string }> = [
    {
      metric: "Lease-up Performance (DOM)",
      n: fmtInt(scorecard.performance.domT12N),
      note: "T12 leased listings",
    },
    {
      metric: "Tenant Retention",
      n: fmtInt(t.multiEpisodeUnits),
      note: `multi-episode units (${t.multiEpisodePct}% of ${fmtInt(t.totalUnits)} observed)`,
    },
    {
      metric: "Rent Performance",
      n: fmtInt(c.urusT12),
      note: "T12 observed urus feeding mix-adjusted YoY",
    },
    {
      metric: "Marketing Discipline",
      n: fmtInt(c.t12Listings),
      note: "T12 listings scored",
    },
  ];
  if (scorecard.communityVisibility) {
    rows.push({
      metric: "Inventory Transparency",
      n: fmtInt(scorecard.communityVisibility.perCommunity.length),
      note: "concentrated communities backing the ratio",
    });
  }
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.perfEyebrowMuted}>Sample sizes per metric</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Metric</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
          N
        </Text>
        <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Backing</Text>
      </View>
      {rows.map((r) => (
        <View key={r.metric} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{r.metric}</Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
            {r.n}
          </Text>
          <Text style={[styles.tableCellMuted, { flex: 3 }]}>{r.note}</Text>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
//  Document — the actual 7-page PDF
// =====================================================================

export function OperatorProfilePDF({
  scorecard,
  cohortTrajectory = null,
  lendingSignals = null,
  shareTrajectory = null,
  mapImageDataUrl = null,
  peerComparisons = EMPTY_PEER_COMPARISONS,
  operatorTrajectory = { pmSlug: "", points: [] },
}: {
  scorecard: ScorecardData;
  /** PR #85 — optional cohort-median rent trajectory overlay. The
   *  API route loads msaPool + calls buildCohortRentTrajectory and
   *  passes the result through here so the rent chart on Page 4
   *  can show the operator-vs-cohort overlay (same as the live
   *  scorecard's Layer 5E section). Null is fine — chart renders
   *  bars only without the overlay. */
  cohortTrajectory?: CohortRentTrajectory | null;
  /** PR #86 — full 5-signal LendingSignals output computed via
   *  buildLendingSignals at the API route. Replaces the prior
   *  "render only the 2 directly-stored signals" approach on
   *  Page 3 so the PDF matches the live page's full lending
   *  signals view. Null falls back to scorecard.lendingSignals
   *  for back-compat. */
  lendingSignals?: LendingSignals | null;
  /** PR #86 — share trajectory data for Page 5. Computed via
   *  buildShareTrajectoryView at the API route. Carries the
   *  auto-generated narrative + the YoY context. Null means
   *  the operator isn't eligible for trajectory display. */
  shareTrajectory?: ShareTrajectoryView | null;
  /** PR #88 — Mapbox Static API map image, pre-fetched by the API
   *  route and passed as a data URL. When present, the Page 4
   *  geographic-coverage section renders the Mapbox map directly
   *  (real streets / water / state boundaries). When null, the
   *  PDF falls back to the SVG dot map from PRs #85-#87. */
  mapImageDataUrl?: string | null;
  /** PR (full parity) — per-metric peer comparisons computed via
   *  buildPeerComparisons at the API route. Drives the enriched
   *  Performance page (sample size, P25/median/P75 distribution
   *  band, nearest-peers mini-table) so it matches the live
   *  PerformanceLayer. Defaults to an all-null map — each null
   *  card renders the "Insufficient data" state, same as the live
   *  page. */
  peerComparisons?: Record<Layer3Metric, PeerComparison | null>;
  /** PR (full parity) — operator snapshot time-series loaded via
   *  loadOperatorTrajectory at the API route. Drives the new
   *  Trajectory page. Empty points → the Trajectory page is
   *  skipped entirely (mirrors OperatorTrajectorySection returning
   *  null). */
  operatorTrajectory?: OperatorTrajectory;
}) {
  const logoDataUrl = getLogoDataUrl();
  const operatorType = classifyOperator(scorecard);
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const axes = starableAxisCount(scorecard);
  const cohortFraming = buildCohortFramingSentence(scorecard);
  const cohortName =
    scorecard.rank.compositeCohortName ?? `${scorecard.market.name} MSA cohort`;
  const exec = scorecard.generatedText?.executiveSummary?.trim();
  const bullets =
    scorecard.generatedText?.distinguishingCharacteristics?.filter(
      (b) => typeof b === "string" && b.trim().length > 0
    ) ?? [];
  const cityState =
    scorecard.market.fullName ??
    `${scorecard.market.name}, ${scorecard.market.state}`;
  const classification =
    scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant ?? "Operator";
  const showInventoryTransparency =
    operatorType === "mfbtr" && scorecard.communityVisibility !== null;
  const invTrans = showInventoryTransparency
    ? inventoryTransparencyDetail(scorecard)
    : null;
  const lendingCards = lendingSignalCards(scorecard, lendingSignals);

  // PR (full parity) — enriched Performance page card set. The shared
  // four always render; Inventory Transparency is appended only when
  // the peer-comparison helper resolved a communityVisibility card
  // (MF/BTR scope gate passed), exactly matching PerformanceLayer.tsx.
  const perfCards: PerfCardConfig[] = [...PERF_CARDS];
  if (peerComparisons.communityVisibility) {
    perfCards.push(PERF_INVENTORY_CARD);
  }

  // Trajectory page is conditional — omitted entirely when there are
  // no snapshots (mirrors OperatorTrajectorySection returning null).
  const showTrajectory = operatorTrajectory.points.length > 0;

  return (
    <Document
      title={`${scorecard.pm.name} — Scorecard`}
      author="Dwellsy IQ"
      subject={`Property manager scorecard for ${scorecard.pm.name}`}
      creator="Dwellsy IQ"
    >
      {/* ============== PAGE 1 — Identity + Synthesis ============== */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.brandRow}>
          {/* PR #86 — Real Dwellsy IQ wordmark image instead of the
              plain "Dwellsy IQ" text. Loaded from public/ via fs
              and embedded as a data URL (module-scope cached).
              Renders at ~120x38pt — visual match for the OG image
              header. Falls back to text if the asset can't load. */}
          {logoDataUrl ? (
            // The 1000x313 source aspect ratio is preserved at 120x38.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              src={logoDataUrl}
              style={{ width: 120, height: 38 }}
            />
          ) : (
            <Text style={styles.brandText}>Dwellsy IQ</Text>
          )}
          <Text style={styles.brandSep}>·</Text>
          <Text style={styles.brandEyebrow}>Property Manager Scorecard</Text>
        </View>

        <Text style={styles.operatorName}>{scorecard.pm.name}</Text>
        <Text style={styles.operatorMeta}>
          {cityState} · {classification}
        </Text>

        {(goldCount > 0 || silverCount > 0) && (
          <View style={styles.starRow}>
            {goldCount > 0 && (
              <StarChip color={COLOR_GOLD} count={goldCount} label="Gold" />
            )}
            {silverCount > 0 && (
              <StarChip color={COLOR_SILVER} count={silverCount} label="Silver" />
            )}
            <Text style={{ fontSize: 10, color: COLOR_MUTED }}>
              {`across ${axes} performance dimensions`}
            </Text>
          </View>
        )}

        <Text style={styles.cohortFraming}>{cohortFraming}</Text>

        {exec && (
          <>
            <Text style={styles.sectionHeader}>Executive Summary</Text>
            <Text style={styles.paragraph}>{exec}</Text>
          </>
        )}

        <Text style={styles.sectionHeader}>Headline Metrics</Text>
        <View style={styles.tilesGrid}>
          <Tile
            title="Est. Portfolio"
            value={portfolioTile(scorecard).value}
            unit={portfolioTile(scorecard).unit}
            star={portfolioTile(scorecard).star}
            compare={portfolioTile(scorecard).compare}
          />
          <Tile
            title="Lease-up Speed"
            value={leaseUpDetail(scorecard).value}
            unit={leaseUpDetail(scorecard).unit}
            star={leaseUpDetail(scorecard).star}
            compare={leaseUpDetail(scorecard).compare}
          />
          <Tile
            title="Tenant Retention"
            value={tenancyDetail(scorecard).value}
            unit={tenancyDetail(scorecard).unit}
            star={tenancyDetail(scorecard).star}
            compare={tenancyDetail(scorecard).compare}
          />
          <Tile
            title="Rent Performance"
            value={rentDetail(scorecard).value}
            unit={rentDetail(scorecard).unit}
            star={rentDetail(scorecard).star}
            compare={rentDetail(scorecard).compare}
          />
          <Tile
            title="Marketing Discipline"
            value={marketingDetail(scorecard).value}
            unit={marketingDetail(scorecard).unit}
            star={marketingDetail(scorecard).star}
            compare={marketingDetail(scorecard).compare}
          />
          {invTrans && (
            <Tile
              title="Inventory Transparency"
              value={invTrans.value}
              unit={invTrans.unit}
              star={invTrans.star}
              compare={invTrans.compare}
            />
          )}
        </View>

        {bullets.length >= 2 && (
          <>
            <Text style={styles.sectionHeader}>Distinguishing Characteristics</Text>
            <View>
              {bullets.slice(0, 4).map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <PageFooter scorecard={scorecard} />
      </Page>

      {/* ============== PAGE 2 — Performance Dimensions ==============
          PR (full parity) — the plain PerformanceCard list is replaced
          by EnrichedPerformanceCards that mirror PerformanceLayer.tsx:
          headline value + trend, sample size (n), a P25/median/P75
          distribution band, and a nearest-peers mini-table. Cards
          carry wrap={false} so a single card never splits across a
          page boundary; the card sequence itself flows onto a
          continuation page when it overflows (react-pdf pagination).
      */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Performance Dimensions" />
        <Text style={styles.paragraph}>
          {`Per-metric performance across the ${axes} starable axes for ${cohortName}. Each card shows the operator's value, the cohort it's compared against, the four nearest neighbors by value, and the star tier earned. Stars reflect quartile position within cohort.`}
        </Text>

        {perfCards.map((cfg) => (
          <EnrichedPerformanceCard
            key={cfg.metric}
            scorecard={scorecard}
            cfg={cfg}
            comparison={peerComparisons[cfg.metric]}
          />
        ))}

        <PageFooter scorecard={scorecard} />
      </Page>

      {/* ============== PAGE 3 — Lending Signals ============== */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Lending Signals" />
        <Text style={styles.paragraph}>
          Underwriting-relevant synthesis signals designed for a 30-second
          scan. These signals don&apos;t feed the composite ranking but inform
          credit decisioning and operational risk assessment.
        </Text>

        {lendingCards.length === 0 ? (
          <Text style={[styles.paragraph, { marginTop: 16, color: COLOR_MUTED }]}>
            Lending signals not yet computed for this operator.
          </Text>
        ) : (
          lendingCards.map((card, i) => <MetricCard key={i} data={card} />)
        )}

        <PageFooter scorecard={scorecard} />
      </Page>

      {/* ============== PAGE 4 — Geographic Coverage + Rent Trajectory ==============
          PR #85 — split portfolio context into TWO pages of visuals.
          Page 4 carries the geographic coverage map and the cohort-
          overlay rent trajectory chart. Page 5 carries the remaining
          portfolio narratives (size estimate, cross-market presence,
          concession activity). Page 6 is the Trajectory page (when the
          operator has snapshots), Page 7 is methodology.
      */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Geographic Coverage & Rent" />

        <Text style={styles.sectionHeader}>Geographic Footprint</Text>
        <View style={{ marginTop: 4 }}>
          {/* PR #88 — Real Mapbox map (PNG fetched server-side by
              the API route). Falls back to the SVG dot map from
              PRs #85-#87 when the Mapbox token is missing or the
              fetch fails. The Mapbox image is 500×240 @2x — same
              dimensions as the SVG fallback so layout doesn't
              shift. */}
          {mapImageDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              src={mapImageDataUrl}
              style={{ width: 500, height: 240 }}
            />
          ) : (
            <GeographicCoverageMap
              coverage={scorecard.geographicCoverage}
              city={scorecard.market.name}
              msaName={
                scorecard.market.fullName ??
                `${scorecard.market.name} MSA`
              }
            />
          )}
        </View>
        <Text style={[styles.tileCompare, { marginTop: 6 }]}>
          {geographicNarrative(scorecard)}
        </Text>

        <Text style={styles.sectionHeader}>Rent Trajectory</Text>
        {Array.isArray(scorecard.rentTrajectory) &&
        scorecard.rentTrajectory.length > 0 ? (
          <>
            <RentTrajectoryChart
              trajectory={scorecard.rentTrajectory}
              cohortTrajectory={cohortTrajectory}
            />
            <Text style={[styles.tileCompare, { marginTop: 8 }]}>
              {rentTrajectoryNarrative(scorecard, cohortTrajectory)}
            </Text>
          </>
        ) : (
          <Text style={styles.paragraph}>
            Insufficient rent observation history for a quarter-by-quarter
            trajectory chart.
          </Text>
        )}

        <PageFooter scorecard={scorecard} />
      </Page>

      {/* ============== PAGE 5 — Portfolio Context ============== */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Portfolio Context" />

        {/* PR #87 — Pages 3 and 5 redesign: every section is now a
            MetricCard so the value is the visual anchor and the
            cohort context plays a supporting role. Replaces the
            prior "section header + narrative paragraph" layout
            where the metric was buried inside prose. */}
        <MetricCard data={portfolioEstimateCard(scorecard)} />
        <MetricCard data={rentLevelSnapshotCard(scorecard)} />
        <MetricCard
          data={shareActivityCard(scorecard, shareTrajectory)}
        />

        {scorecard.canonicalOperatorName &&
          scorecard.canonicalOperatorName !== scorecard.pm.name && (
            <>
              <Text style={styles.sectionHeader}>Cross-Market Presence</Text>
              <Text style={styles.paragraph}>
                {`${scorecard.pm.name} rolls up into the cross-market entity ${scorecard.canonicalOperatorName}. See the operator profile at iq.dwellsy.com/operators for aggregated cross-market metrics.`}
              </Text>
            </>
          )}

        {(() => {
          const ca = concessionActivityCard(scorecard);
          if (!ca) return null;
          const samples =
            scorecard.concessionSamples ??
            (scorecard.concessionSampleText
              ? [scorecard.concessionSampleText]
              : []);
          return (
            <>
              <MetricCard data={ca} />
              {/* Concession sample excerpts as quoted blocks beneath
                  the headline rate. Up to 3 representative listing
                  excerpts the seed pipeline picks. */}
              {samples.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {samples.slice(0, 3).map((s, i) => (
                    <View key={i} style={styles.concessionSample}>
                      <Text style={styles.concessionSampleText}>
                        {`"${s.trim()}"`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          );
        })()}

        <PageFooter scorecard={scorecard} />
      </Page>

      {/* ============== PAGE 6 — Trajectory ==============
          PR (full parity) — mirrors OperatorTrajectorySection.tsx.
          Web order is Portfolio → Trajectory → Methodology, so this
          sits between Page 5 (Portfolio Context) and Page 7
          (Methodology). Rendered only when the operator has at least
          one OperatorSnapshot; otherwise the page is omitted and the
          document is 6 pages (footers still read "of 7"). */}
      {showTrajectory && (
        <Page size="LETTER" style={styles.page}>
          <PageHeader scorecard={scorecard} sectionTitle="Trajectory" />
          <Text style={styles.trajectorySubtitle}>
            How this operator has tracked across Dwellsy IQ refreshes.
          </Text>
          <TrajectoryPageBody trajectory={operatorTrajectory} />
          <PageFooter scorecard={scorecard} />
        </Page>
      )}

      {/* ============== PAGE 7 — Methodology & Limits ============== */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Methodology & Limits" />

        <Text style={styles.sectionHeader}>Methodology Version</Text>
        <Text style={styles.paragraph}>
          {`This scorecard was rendered against methodology ${scorecard.methodologyVersion}`}
          {scorecard.designVersion ? `, design ${scorecard.designVersion}` : ""}.
          {` Underlying data is current as of ${fmtDate(scorecard.dataAsOf)}.`}
        </Text>

        <Text style={styles.sectionHeader}>What we measure</Text>
        <Text style={styles.paragraph}>
          {`Five performance dimensions earn per-metric stars based on cohort
position: Lease-up Speed, Tenant Retention, Rent Performance,
Marketing Discipline, and (for MF/BTR operators with sufficient
community visibility) Inventory Transparency. Gold = top quartile;
silver = above median below top quartile; no star = present in cohort.`}
        </Text>

        <Text style={styles.sectionHeader}>Limits and caveats</Text>
        <Text style={styles.paragraph}>
          {`Cohorts are drawn from the operator's primary MSA + classification.
Where the primary cohort has fewer than 8 ranked operators, fallback
cohorts (broader classification, then MSA-wide) are used. Operator
dignity language gates suppress per-metric scores when underlying
data isn't strong enough to support a defensible quartile placement.
Lending signals are descriptive synthesis only — they don't feed the
composite ranking.`}
        </Text>

        {/* PR (full parity) — classification rationale + coverage
            universe tables ported from MethodologyFooter.tsx. */}
        {scorecard.classificationRationale ? (
          <>
            <Text style={styles.sectionHeader}>Classification Rationale</Text>
            <Text style={styles.paragraph}>
              {scorecard.classificationRationale}
            </Text>
          </>
        ) : null}

        <Text style={styles.sectionHeader}>Coverage Universe</Text>
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 24,
            marginTop: 2,
          }}
        >
          <MethodologyCoverageTable scorecard={scorecard} />
          <MethodologyPortfolioTable scorecard={scorecard} />
        </View>

        <MethodologySampleSizeTable scorecard={scorecard} />

        <Text style={styles.sectionHeader}>Where to dig deeper</Text>
        <Text style={styles.paragraph}>
          {`The full methodology document — including data sources, the
operator-dignity gate criteria, and the per-metric quartile
derivation — lives at iq.dwellsy.com/methodology. Per-market
context and peer comparison tools are at iq.dwellsy.com.`}
        </Text>

        <PageFooter scorecard={scorecard} />
      </Page>
    </Document>
  );
}

// --- Page 2 performance card ---

// PR #87 — MetricCard. Shared metric-prominent card used on Pages
// 3 (Lending Signals) and 5 (Portfolio Context / Rent Level
// Snapshot / Share of Listing Activity / Concession Activity).
// Same visual structure as PerformanceCard but driven by
// MetricCardData (which carries an explicit `value` field rather
// than burying the number inside a narrative sentence).
function MetricCard({ data }: { data: MetricCardData }) {
  return (
    <View style={styles.signalCard}>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {/* Left column — title + narrative context */}
        <View style={{ flex: 1, paddingTop: 2 }}>
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={styles.signalTitle}>{data.title}</Text>
            {data.star === "gold" && (
              <Text style={[styles.starGlyph, { color: COLOR_GOLD }]}>★</Text>
            )}
            {data.star === "silver" && (
              <Text style={[styles.starGlyph, { color: COLOR_SILVER }]}>★</Text>
            )}
          </View>
          <Text style={[styles.signalDetail, { marginTop: 6 }]}>
            {data.context}
          </Text>
        </View>

        {/* Right column — big value + optional unit below.
            Fixed width keeps values aligned across rows. */}
        <View
          style={{
            width: 130,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <Text style={styles.tileValue}>{data.value}</Text>
          {data.valueUnit ? (
            <Text
              style={[
                styles.tileUnit,
                { marginTop: 2, textAlign: "right" },
              ]}
            >
              {data.valueUnit}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// PR (full parity) — the old text-only PerformanceCard (Page 2 before
// the parity work) has been superseded by EnrichedPerformanceCard,
// which mirrors the live PerformanceLayer (distribution band + peer
// table). It was removed to keep the module free of dead code.

// --- Page 4 narratives ---

// PR #86 — Rent Level Snapshot narrative. Pulls the most recent
// quarter's mix-adjusted median rent from the trajectory (which we
// already have on the scorecard) and pairs it with the listing
// count behind that quarter. Complements the Page 4 trajectory
// chart with a point-in-time anchor.
function rentLevelSnapshot(scorecard: ScorecardData): string {
  const traj = scorecard.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) {
    return "Rent level not yet computed for this operator (insufficient listing observations).";
  }
  // The trajectory is ordered chronologically; the last entry is
  // the most recent quarter.
  const latest = traj[traj.length - 1];
  if (!latest || typeof latest.mixAdjMedian !== "number") {
    return "Rent level not yet computed for this operator.";
  }
  const parts: string[] = [];
  parts.push(
    `Most recent quarter (${latest.quarter}): $${fmtInt(latest.mixAdjMedian)}/mo mix-adjusted median rent`
  );
  parts.push(`based on ${fmtInt(latest.n)} observed listings`);
  // Add a 6-quarter comparison if the first quarter has data.
  const earliest = traj[0];
  if (earliest && typeof earliest.mixAdjMedian === "number") {
    const delta = latest.mixAdjMedian - earliest.mixAdjMedian;
    const pct = (delta / earliest.mixAdjMedian) * 100;
    parts.push(
      `${delta >= 0 ? "+" : ""}$${fmtInt(Math.abs(delta))} (${fmtPct(pct, 1, true)}) since ${earliest.quarter}`
    );
  }
  return parts.join(". ") + ".";
}

// PR #86 — Share of Listing Activity narrative. Uses the
// pre-generated narrative from buildShareTrajectoryView when the
// API route provides it (carries the 6-variant interpretation
// keyed on eligibility + delta-from-cohort thresholds). Falls
// back to a compact T12/T24-T12 listing-count comparison when
// shareTrajectory wasn't computed.
function shareActivityNarrative(
  scorecard: ScorecardData,
  shareTrajectory: ShareTrajectoryView | null
): string {
  if (shareTrajectory?.narrative) {
    return shareTrajectory.narrative;
  }
  // Fallback path: derive a narrative from raw listing counts.
  const t12 = scorecard.t12ListingsCount;
  const t24t12 = scorecard.t24t12ListingsCount;
  if (typeof t12 !== "number") {
    return "Share-of-activity context not yet computed for this operator.";
  }
  const parts: string[] = [];
  parts.push(`Trailing 12 months: ${fmtInt(t12)} listings observed`);
  if (typeof t24t12 === "number" && t24t12 > 0) {
    const yoy = ((t12 - t24t12) / t24t12) * 100;
    parts.push(
      `prior 12-month window: ${fmtInt(t24t12)} (${fmtPct(yoy, 1, true)} YoY)`
    );
  }
  return parts.join(", ") + ".";
}

// PR #87 — Page 5 section builders that return MetricCardData
// (big-value-on-the-right format) instead of plain Text paragraphs.

function portfolioEstimateCard(scorecard: ScorecardData): MetricCardData {
  const est = scorecard.portfolioEstimate;
  if (!est || (est.status !== "estimated") || typeof est.point !== "number") {
    return {
      title: "Portfolio Size Estimate",
      value: "—",
      context:
        est?.message ??
        "Insufficient data to estimate portfolio size for this operator.",
    };
  }
  const contextParts: string[] = [];
  if (typeof est.low === "number" && typeof est.high === "number") {
    contextParts.push(
      `Range: ${fmtInt(est.low)}–${fmtInt(est.high)} units`
    );
  }
  if (est.confidence) {
    contextParts.push(`${est.confidence} confidence`);
  }
  if (est.cohort) {
    contextParts.push(est.cohort);
  }
  contextParts.push(
    "Blends trailing 12-month listing volume with observed turnover ratios for the operator's cohort."
  );
  return {
    title: "Portfolio Size Estimate",
    value: fmtInt(est.point),
    valueUnit: "units",
    context: contextParts.join("  ·  "),
  };
}

function rentLevelSnapshotCard(scorecard: ScorecardData): MetricCardData {
  const traj = scorecard.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) {
    return {
      title: "Rent Level Snapshot",
      value: "—",
      context:
        "Rent level not yet computed for this operator (insufficient listing observations).",
    };
  }
  const latest = traj[traj.length - 1];
  if (!latest || typeof latest.mixAdjMedian !== "number") {
    return {
      title: "Rent Level Snapshot",
      value: "—",
      context: "Rent level not yet computed for this operator.",
    };
  }
  const contextParts: string[] = [];
  contextParts.push(`Most recent quarter: ${latest.quarter}`);
  contextParts.push(`${fmtInt(latest.n)} observed listings`);
  const earliest = traj[0];
  if (earliest && typeof earliest.mixAdjMedian === "number" && earliest.mixAdjMedian > 0) {
    const delta = latest.mixAdjMedian - earliest.mixAdjMedian;
    const pct = (delta / earliest.mixAdjMedian) * 100;
    contextParts.push(
      `${delta >= 0 ? "+" : "-"}$${fmtInt(Math.abs(delta))} (${fmtPct(pct, 1, true)}) since ${earliest.quarter}`
    );
  }
  return {
    title: "Rent Level Snapshot",
    value: `$${fmtInt(latest.mixAdjMedian)}`,
    valueUnit: "mix-adj median / mo",
    context: contextParts.join("  ·  ") + ".",
  };
}

function shareActivityCard(
  scorecard: ScorecardData,
  shareTrajectory: ShareTrajectoryView | null
): MetricCardData {
  const t12 = scorecard.t12ListingsCount;
  if (typeof t12 !== "number") {
    return {
      title: "Share of Listing Activity",
      value: "—",
      context: "Share-of-activity context not yet computed for this operator.",
    };
  }
  // Use the pre-generated narrative from buildShareTrajectoryView
  // when available — it carries the 6-variant interpretation. Otherwise
  // assemble a simpler narrative from the raw counts.
  const context =
    shareTrajectory?.narrative ??
    (() => {
      const t24t12 = scorecard.t24t12ListingsCount;
      if (typeof t24t12 === "number" && t24t12 > 0) {
        const yoy = ((t12 - t24t12) / t24t12) * 100;
        return `Prior 12-month window: ${fmtInt(t24t12)} listings. ${fmtPct(yoy, 1, true)} YoY change in listing volume.`;
      }
      return "Trailing 12-month listing volume baseline; no prior-window comparison available.";
    })();
  return {
    title: "Share of Listing Activity",
    value: fmtInt(t12),
    valueUnit: "T12 listings observed",
    context,
  };
}

function concessionActivityCard(scorecard: ScorecardData): MetricCardData | null {
  if (
    scorecard.concessionRate === null ||
    scorecard.concessionRate === undefined
  ) {
    return null;
  }
  const pct = Math.round((scorecard.concessionRate ?? 0) * 100);
  const n = scorecard.concessionListingCount ?? 0;
  return {
    title: "Concession Activity",
    value: `${pct}`,
    valueUnit: "% of T12 listings",
    context: `${fmtInt(n)} observed listings included a concession offer in the trailing 12 months.`,
  };
}

function portfolioNarrative(scorecard: ScorecardData): string {
  const est = scorecard.portfolioEstimate;
  if (!est) return "No portfolio estimate available for this operator.";
  if (est.status === "estimated" && typeof est.point === "number") {
    const range =
      typeof est.low === "number" && typeof est.high === "number"
        ? ` (range: ${fmtInt(est.low)}–${fmtInt(est.high)} units)`
        : "";
    const confidence = est.confidence ? `${est.confidence} confidence` : "";
    const cohort = est.cohort ? `, ${est.cohort}` : "";
    return `Estimated portfolio: ${fmtInt(est.point)} units${range}. ${confidence}${cohort}. Estimates blend trailing 12-month listing volume with observed turnover ratios for the operator's cohort.`;
  }
  return est.message ?? "Insufficient data for a portfolio estimate.";
}

function rentTrajectoryNarrative(
  scorecard: ScorecardData,
  cohortTrajectory: CohortRentTrajectory | null
): string {
  // Match the live chart's caption pattern: operator vs cohort
  // overlay context. Pulls the YoY headline from rentPerformance
  // when available, and adds cohort framing when the overlay is
  // present.
  const rp = scorecard.rentPerformance;
  if (!rp) {
    return "Operator-level rent trajectory across the trailing 6 quarters. Cohort overlay unavailable.";
  }
  const yoyLabel = fmtPct(rp.pmYoyChange * 100, 1, true);
  const cohortLabel = cohortTrajectory
    ? cohortTrajectory.cohortName
    : null;
  const cohortYoy = rp.cohortMedianYoyChange ?? null;
  const cohortYoyLabel =
    cohortYoy !== null ? fmtPct(cohortYoy * 100, 1, true) : null;
  if (cohortLabel && cohortYoyLabel) {
    return `${scorecard.pm.name} headline YoY: ${yoyLabel}. ${cohortLabel} median YoY: ${cohortYoyLabel}. Bars are mix-adjusted median rent per quarter; the line is the cohort median for the same quarters. Rent level is descriptive — the composite-feeding signal is the YoY delta on Page 2.`;
  }
  return `${scorecard.pm.name} headline YoY: ${yoyLabel}. Cohort overlay unavailable for this operator's cohort.`;
}

function geographicNarrative(scorecard: ScorecardData): string {
  const cov = scorecard.geographicCoverage;
  const parts: string[] = [];
  if (cov.citiesText) {
    parts.push(cov.citiesText);
  }
  // PR #86 — Bug fix: cov.topCities[].pct is stored as a percent
  // (76 = 76%), not a decimal. Pre-PR-86 code multiplied by 100,
  // producing "Chattanooga 7600%" in the rendered narrative.
  // Just round the value directly.
  if (cov.topCities && cov.topCities.length > 0) {
    const topCitiesStr = cov.topCities
      .slice(0, 3)
      .map((c) => `${c.name} ${Math.round(c.pct)}%`)
      .join(", ");
    parts.push(`Top cities: ${topCitiesStr}`);
  }
  // Pull observation history from the geographic-concentration lending
  // signal when available — it carries the trailing-window length.
  const ls = scorecard.lendingSignals?.rentStability;
  if (ls && !ls.suppressed) {
    parts.push(`${fmtNumber(ls.yearsOfHistory, 1)} years of observation history`);
  }
  if (parts.length === 0) {
    return "Geographic coverage details are not yet computed for this operator.";
  }
  return parts.join(" · ") + ".";
}
