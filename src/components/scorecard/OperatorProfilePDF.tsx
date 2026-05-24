// PR #84 — Operator profile PDF.
//
// Purpose-built deal-room artifact. Replaces the old window.print()
// "Print / Save as PDF" path (which rendered the live page DOM
// through the browser's print pipeline and produced inconsistent
// output across browsers). Instead, this is a deterministic 4–5
// page PDF rendered server-side via @react-pdf/renderer, branded
// to match the OG-image design language (navy + teal + gold/silver
// star chips), with the same data the scorecard surface exposes
// but laid out for a single-shot share artifact:
//
//   Page 1 — Identity + Synthesis
//     Wordmark + operator name + cohort + star chips +
//     cohort framing sentence + executive summary +
//     headline metric tiles + distinguishing characteristics
//
//   Page 2 — Performance dimensions
//     One card per starable axis (Lease-up Speed, Tenant Retention,
//     Rent Performance, Marketing Discipline, + Inventory
//     Transparency for MF/BTR). Star + headline value + cohort
//     comparison.
//
//   Page 3 — Lending signals
//     The 5 underwriting-relevant synthesis signals from
//     scorecard.lendingSignals (Vacancy, Rent Stability, Operator
//     Stability, Geographic Concentration, Pricing Tier).
//
//   Page 4 — Portfolio context
//     Estimated portfolio + range + confidence, observation
//     history, cross-market presence (if multi-market), geographic
//     concentration narrative.
//
//   Page 5 — Methodology & limits
//     Methodology version, design version, dataAsOf, data caveats,
//     pointer to iq.dwellsy.com/methodology for the full version.
//
// Every page carries a footer with brand + page number + URL +
// methodology + dataAsOf. Charts (rent trajectory, share trajectory,
// peer comparisons) are intentionally OMITTED — those depend on
// Recharts which is client-side only, and the analytical content
// they convey is already in the prose + metric values. Per PR #84
// scope decision: text + metrics only.

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

function PageFooter({
  scorecard,
  pageLabel,
}: {
  scorecard: ScorecardData;
  pageLabel: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Methodology {scorecard.methodologyVersion}
        {scorecard.designVersion ? ` · Design ${scorecard.designVersion}` : ""}
        {" · Data as of "}
        {fmtDate(scorecard.dataAsOf)}
      </Text>
      <Text>
        {pageLabel} · <Text style={styles.footerLink}>iq.dwellsy.com</Text>
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
    // Fallback to the stylized SVG blob the live page renders when
    // no coverage points are available — better than empty space.
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

  // For the size of each coverage circle, scale log(n) so dense
  // areas don't completely obscure sparse ones. Clamp [2, 6] so
  // even single-listing dots are visible.
  function pointRadius(n: number): number {
    return Math.max(2, Math.min(6, 2 + Math.log10(Math.max(n, 1)) * 1.6));
  }

  // PR #86 — Dropped the MSA backdrop polyline. The
  // msaBackdropPoints array carries unordered point samples that
  // Mapbox uses for viewport-bounds calculation on the live page;
  // they are NOT in geographic-boundary order, so rendering them
  // as a Polyline produces a chaotic fan (rendered output looked
  // like a paper airplane crashed into the operator's footprint).
  // Computing a convex hull would give a cleaner shape but it's
  // still a fake boundary that doesn't reflect the real MSA
  // outline. Easier and more honest: drop the backdrop. The MSA
  // name in the section header + the cities narrative below the
  // map carries the geographic context. The operator's coverage
  // points stand on their own as the actual signal.

  return (
    <Svg width={MAP_W} height={MAP_H}>
      <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#F2F5F8" />
      {points.map((p, i) => {
        const { x, y } = project(p.lat, p.lon);
        const r = pointRadius(p.n);
        return (
          <G key={i}>
            <Circle
              cx={x}
              cy={y}
              r={r * 2.2}
              fill={COLOR_TEAL}
              fillOpacity={0.15}
            />
            <Circle
              cx={x}
              cy={y}
              r={r}
              fill={COLOR_TEAL}
              stroke="#ffffff"
              strokeWidth={1}
            />
          </G>
        );
      })}
      {/* Reference: render an unobtrusive city/MSA label at the
          top-right of the map. Uses a small white-on-muted text
          to suggest "this is where" without competing with the
          actual points. */}
      <Rect
        x={MAP_W - 180}
        y={8}
        width={172}
        height={20}
        fill="#ffffff"
        fillOpacity={0.85}
        rx={3}
      />
    </Svg>
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

interface SignalCardData {
  title: string;
  detail: string;
  /** When non-null, rendered as a small star icon next to the title.
   *  Same star semantics as the rest of the doc: gold = top quartile,
   *  silver = above median, null = present in cohort / not starred. */
  star?: StarLevel;
}

function vacancySignalCard(v: VacancySignal): SignalCardData {
  if (v.vacancyPct === null) {
    return {
      title: "Vacancy Signal",
      detail: "Insufficient DOM or tenancy data to compute vacancy ratio.",
      star: null,
    };
  }
  return {
    title: "Vacancy Signal",
    detail: `Estimated cycle vacancy: ${fmtNumber(v.vacancyPct, 1)}%. Derived from lease-up speed and tenant retention. Lower indicates less downtime between tenancies.`,
    star: v.star,
  };
}

function rentStabilitySignalCard(rs: RentStabilitySignal): SignalCardData {
  if (rs.suppressed) {
    return {
      title: "Rent Stability",
      detail:
        rs.reason ?? "Insufficient rent observation history for this operator.",
      star: rs.star,
    };
  }
  const parts: string[] = [];
  if (rs.volatilityPP !== null) {
    parts.push(`Volatility ${fmtNumber(rs.volatilityPP, 1)}pp`);
  }
  if (rs.cohortMedianVolatility !== null) {
    parts.push(`cohort median ${fmtNumber(rs.cohortMedianVolatility, 1)}pp`);
  }
  parts.push(`${fmtNumber(rs.yearsOfHistory, 1)}y observation window`);
  return {
    title: "Rent Stability",
    detail: parts.join("  ·  "),
    star: rs.star,
  };
}

function operatorStabilitySignalCard(
  os: OperatorStabilitySignal
): SignalCardData {
  const years =
    os.yearsVisible !== null ? `${fmtNumber(os.yearsVisible, 1)} years` : "—";
  const markets =
    os.marketCount > 1
      ? `${os.marketCount} markets observed`
      : "Single-market operator";
  return {
    title: "Operator Stability",
    detail: `Visible for ${years} in our data. ${markets}. Longer observation history = lower model-error risk for credit decisions.`,
    star: os.star,
  };
}

function geographicConcentrationSignalCard(
  gc: GeographicConcentrationSignal
): SignalCardData {
  // PR #86 — gc.top3CityShare and cohortMedianTop3 are stored as
  // decimals (0.76 = 76%), so multiply for display. Confirmed by
  // reading buildGeographicConcentrationSignal at src/lib/lending-signals.ts
  const labels = {
    more_concentrated: "More concentrated than cohort",
    near_cohort: "Near cohort median",
    more_dispersed: "More dispersed than cohort",
  } as const;
  return {
    title: "Geographic Concentration",
    detail: `Top-3 city share ${Math.round(gc.top3CityShare * 100)}%  ·  cohort median ${Math.round(gc.cohortMedianTop3 * 100)}%  ·  ${labels[gc.positionIndicator]}.`,
    star: null,
  };
}

function pricingTierSignalCard(pt: PricingTierSignal): SignalCardData {
  if (pt.tier === null || pt.operatorRent === null) {
    return {
      title: "Pricing Tier",
      detail: "Insufficient rent data to classify pricing tier.",
      star: null,
    };
  }
  const tierLabels = {
    premium: "Premium tier",
    "mid-market": "Mid-market tier",
    value: "Value tier",
  } as const;
  const parts: string[] = [];
  parts.push(`${tierLabels[pt.tier]} — operator median ${`$${fmtInt(pt.operatorRent)}`}/mo`);
  if (pt.percentile !== null) {
    parts.push(`${Math.round(pt.percentile)}th percentile in MSA rent distribution`);
  }
  if (pt.msaP25 !== null && pt.msaP75 !== null) {
    parts.push(`MSA P25–P75: $${fmtInt(pt.msaP25)}–$${fmtInt(pt.msaP75)}`);
  }
  return {
    title: "Pricing Tier",
    detail: parts.join("  ·  "),
    star: null,
  };
}

function lendingSignalCards(
  scorecard: ScorecardData,
  resolved: LendingSignals | null
): SignalCardData[] {
  // Prefer the full resolved signals when the API route provided
  // them (post-PR-#86). Fall back to the 2-signal stored set if
  // not, so older calls still render something. The stored types
  // are slightly looser than the buildLendingSignals output (no
  // `kind` discriminator, optional cohortMedianVolatility), so we
  // adapt them explicitly here.
  if (!resolved) {
    const signals: SignalCardData[] = [];
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
  const signals: SignalCardData[] = [];
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
//  Document — the actual 4–5 page PDF
// =====================================================================

export function OperatorProfilePDF({
  scorecard,
  cohortTrajectory = null,
  lendingSignals = null,
  shareTrajectory = null,
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

        <PageFooter scorecard={scorecard} pageLabel="Page 1 of 6" />
      </Page>

      {/* ============== PAGE 2 — Performance Dimensions ============== */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Performance Dimensions" />
        <Text style={styles.paragraph}>
          {`Per-metric performance across the ${axes} starable axes for ${cohortName}. Each card shows the operator's value, the cohort comparison, and the star tier earned.`}
        </Text>

        <PerformanceCard title="Lease-up Speed" detail={leaseUpDetail(scorecard)} />
        <PerformanceCard title="Tenant Retention" detail={tenancyDetail(scorecard)} />
        <PerformanceCard title="Rent Performance" detail={rentDetail(scorecard)} />
        <PerformanceCard title="Marketing Discipline" detail={marketingDetail(scorecard)} />
        {invTrans && (
          <PerformanceCard title="Inventory Transparency" detail={invTrans} />
        )}

        <PageFooter scorecard={scorecard} pageLabel="Page 2 of 6" />
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
          lendingCards.map((card, i) => (
            <View key={i} style={styles.signalCard}>
              <View
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text style={styles.signalTitle}>{card.title}</Text>
                {card.star === "gold" && (
                  <Text style={[styles.starGlyph, { color: COLOR_GOLD }]}>★</Text>
                )}
                {card.star === "silver" && (
                  <Text style={[styles.starGlyph, { color: COLOR_SILVER }]}>★</Text>
                )}
              </View>
              <Text style={styles.signalDetail}>{card.detail}</Text>
            </View>
          ))
        )}

        <PageFooter scorecard={scorecard} pageLabel="Page 3 of 6" />
      </Page>

      {/* ============== PAGE 4 — Geographic Coverage + Rent Trajectory ==============
          PR #85 — split portfolio context into TWO pages of visuals.
          Page 4 carries the geographic coverage map and the cohort-
          overlay rent trajectory chart. Page 5 carries the remaining
          portfolio narratives (size estimate, cross-market presence,
          concession activity). Page 6 is methodology.
      */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Geographic Coverage & Rent" />

        <Text style={styles.sectionHeader}>Geographic Footprint</Text>
        <View style={{ marginTop: 4 }}>
          <GeographicCoverageMap
            coverage={scorecard.geographicCoverage}
            city={scorecard.market.name}
            msaName={
              scorecard.market.fullName ??
              `${scorecard.market.name} MSA`
            }
          />
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

        <PageFooter scorecard={scorecard} pageLabel="Page 4 of 6" />
      </Page>

      {/* ============== PAGE 5 — Portfolio Context ============== */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader scorecard={scorecard} sectionTitle="Portfolio Context" />

        <Text style={styles.sectionHeader}>Portfolio Size Estimate</Text>
        <Text style={styles.paragraph}>{portfolioNarrative(scorecard)}</Text>

        {/* PR #86 — Rent Level Snapshot. Surfaces the most recent
            mix-adjusted median rent from the trajectory + the
            observation count behind it. Complements the Page 4
            rent trajectory chart (which shows the trend) with the
            point-in-time anchor. */}
        <Text style={styles.sectionHeader}>Rent Level Snapshot</Text>
        <Text style={styles.paragraph}>{rentLevelSnapshot(scorecard)}</Text>

        {/* PR #86 — Share of Listing Activity. Same data the live
            page renders in the Share Trajectory section. Uses the
            pre-generated narrative when available (carries the
            6-variant interpretation from buildShareTrajectoryNarrative),
            falls back to a compact T12/T24-T12 listing-count
            comparison when shareTrajectory wasn't computed. */}
        <Text style={styles.sectionHeader}>Share of Listing Activity</Text>
        <Text style={styles.paragraph}>
          {shareActivityNarrative(scorecard, shareTrajectory)}
        </Text>

        {scorecard.canonicalOperatorName &&
          scorecard.canonicalOperatorName !== scorecard.pm.name && (
            <>
              <Text style={styles.sectionHeader}>Cross-Market Presence</Text>
              <Text style={styles.paragraph}>
                {`${scorecard.pm.name} rolls up into the cross-market entity ${scorecard.canonicalOperatorName}. See the operator profile at iq.dwellsy.com/operators for aggregated cross-market metrics.`}
              </Text>
            </>
          )}

        {scorecard.concessionRate !== null &&
          scorecard.concessionRate !== undefined && (
            <>
              <Text style={styles.sectionHeader}>Concession Activity</Text>
              <Text style={styles.paragraph}>
                {`${Math.round((scorecard.concessionRate ?? 0) * 100)}% of observed listings (n=${scorecard.concessionListingCount ?? 0}) included a concession offer in the trailing 12 months.`}
              </Text>
              {/* PR #86 — Concession sample excerpts. The seed
                  pipeline picks up to 3 representative listing
                  excerpts so the PDF reader can see what the
                  concession language actually looks like in the
                  operator's own listings. Same data the live
                  page renders in the Concession Activity card. */}
              {(() => {
                const samples =
                  scorecard.concessionSamples ??
                  (scorecard.concessionSampleText
                    ? [scorecard.concessionSampleText]
                    : []);
                if (samples.length === 0) return null;
                return (
                  <View style={{ marginTop: 6 }}>
                    {samples.slice(0, 3).map((s, i) => (
                      <View key={i} style={styles.concessionSample}>
                        <Text style={styles.concessionSampleText}>
                          {`"${s.trim()}"`}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </>
          )}

        <PageFooter scorecard={scorecard} pageLabel="Page 5 of 6" />
      </Page>

      {/* ============== PAGE 6 — Methodology & Limits ============== */}
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

        <Text style={styles.sectionHeader}>Where to dig deeper</Text>
        <Text style={styles.paragraph}>
          {`The full methodology document — including data sources, the
operator-dignity gate criteria, and the per-metric quartile
derivation — lives at iq.dwellsy.com/methodology. Per-market
context and peer comparison tools are at iq.dwellsy.com.`}
        </Text>

        <PageFooter scorecard={scorecard} pageLabel="Page 6 of 6" />
      </Page>
    </Document>
  );
}

// --- Page 2 performance card ---

function PerformanceCard({
  title,
  detail,
}: {
  title: string;
  detail: {
    value: string;
    unit: string;
    star: StarLevel;
    compare: string;
  };
}) {
  // PR #86 — Restructured layout per Jonas's feedback. Numbers
  // need to right-align across every card so the values stack
  // in a single column. Solution: two-column flex with the metric
  // name + comparison narrative on the left, and the number + unit
  // (with unit stacked BELOW the number) + star on the right. The
  // right column has a fixed width so number alignment stays
  // consistent across rent-pp, days, mo, /100, etc.
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
        {/* Left column — metric name + comparison narrative */}
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={styles.signalTitle}>{title}</Text>
          <Text style={[styles.signalDetail, { marginTop: 6 }]}>
            {detail.compare}
          </Text>
        </View>

        {/* Right column — big number + unit below + star.
            Width fixed so values align across cards. */}
        <View
          style={{
            width: 110,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <Text style={styles.tileValue}>{detail.value}</Text>
            {detail.star === "gold" ? (
              <Text style={[styles.starGlyph, { color: COLOR_GOLD }]}>★</Text>
            ) : detail.star === "silver" ? (
              <Text style={[styles.starGlyph, { color: COLOR_SILVER }]}>★</Text>
            ) : null}
          </View>
          {detail.unit ? (
            <Text style={[styles.tileUnit, { marginTop: 2 }]}>{detail.unit}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

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
