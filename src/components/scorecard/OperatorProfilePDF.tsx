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

import {
  Document,
  Page,
  Text,
  View,
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

  const backdropPath =
    backdrop.length >= 3
      ? backdrop
          .map((p) => {
            const { x, y } = project(p.lat, p.lon);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  return (
    <Svg width={MAP_W} height={MAP_H}>
      <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#F2F5F8" />
      {backdropPath && (
        <Polyline
          points={backdropPath}
          fill="#ffffff"
          stroke="#D5DBE3"
          strokeWidth={1.2}
        />
      )}
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
  const compare = Number.isFinite(peerMedian)
    ? Math.abs(delta) < 0.05
      ? `vs cohort median ${fmtNumber(peerMedian, 1)} days`
      : `${delta < 0 ? "▼" : "▲"} ${fmtNumber(Math.abs(delta), 1)}d vs cohort ${fmtNumber(peerMedian, 1)}d`
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
  const compare =
    t.overallGap !== null && cohortMedian !== null
      ? `${t.overallGap > cohortMedian ? "▲" : "▼"} ${fmtNumber(Math.abs(t.overallGap - cohortMedian), 1)}mo vs cohort ${fmtNumber(cohortMedian, 1)}mo`
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
// The seed stores only two signals directly on scorecard.lendingSignals
// (rentStability + geographicConcentration). The live LendingSignals
// component derives three more (vacancy, operator stability, pricing
// tier) at render time from msaPool + scorecard fields. Reproducing
// that derivation here would require loading the MSA pool at PDF
// render time, which is feasible but out of scope for this PR. The
// PDF surfaces the two stored signals + a pointer to iq.dwellsy.com
// for the full lending-signals view.

interface SignalCardData {
  title: string;
  detail: string;
}

function lendingSignalCards(scorecard: ScorecardData): SignalCardData[] {
  const signals: SignalCardData[] = [];
  const ls = scorecard.lendingSignals;
  if (!ls) return signals;

  // Rent Stability — coefficient of variation across observation
  // window. Lower = more stable rents. Suppressed when seed pipeline
  // couldn't compute it (insufficient observation history).
  if (ls.rentStability) {
    const rs = ls.rentStability;
    const detail = rs.suppressed
      ? rs.reason ?? "Insufficient rent observation history for this operator"
      : (() => {
          const parts: string[] = [];
          if (rs.volatilityPP !== null) {
            parts.push(`Volatility ${fmtNumber(rs.volatilityPP, 1)}pp`);
          }
          if (rs.cohortMedianVolatility !== undefined) {
            parts.push(
              `cohort median ${fmtNumber(rs.cohortMedianVolatility, 1)}pp`
            );
          }
          parts.push(`${fmtNumber(rs.yearsOfHistory, 1)}y observation window`);
          return parts.join(" · ");
        })();
    signals.push({ title: "Rent Stability", detail });
  }

  // Geographic Concentration — top-3 city share vs cohort median.
  // Linear-position indicator labels the relative posture.
  if (ls.geographicConcentration) {
    const gc = ls.geographicConcentration;
    const labels = {
      more_concentrated: "More concentrated than cohort",
      near_cohort: "Near cohort median",
      more_dispersed: "More dispersed than cohort",
    } as const;
    const detail = `Top-3 city share ${Math.round(gc.top3CityShare * 100)}%  ·  cohort median ${Math.round(gc.cohortMedianTop3 * 100)}%  ·  ${labels[gc.linearPositionIndicator]}`;
    signals.push({ title: "Geographic Concentration", detail });
  }

  return signals;
}

// =====================================================================
//  Document — the actual 4–5 page PDF
// =====================================================================

export function OperatorProfilePDF({
  scorecard,
  cohortTrajectory = null,
}: {
  scorecard: ScorecardData;
  /** PR #85 — optional cohort-median rent trajectory overlay. The
   *  API route loads msaPool + calls buildCohortRentTrajectory and
   *  passes the result through here so the rent chart on Page 4
   *  can show the operator-vs-cohort overlay (same as the live
   *  scorecard's Layer 5E section). Null is fine — chart renders
   *  bars only without the overlay. */
  cohortTrajectory?: CohortRentTrajectory | null;
}) {
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
  const lendingCards = lendingSignalCards(scorecard);

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
          <Text style={styles.brandText}>Dwellsy IQ</Text>
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
              <Text style={styles.signalTitle}>{card.title}</Text>
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
  return (
    <View style={styles.signalCard}>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Text style={styles.signalTitle}>{title}</Text>
        <View
          style={{ display: "flex", flexDirection: "row", alignItems: "baseline", gap: 4 }}
        >
          <Text style={styles.tileValue}>{detail.value}</Text>
          {detail.unit ? <Text style={styles.tileUnit}>{detail.unit}</Text> : null}
          {detail.star === "gold" ? (
            <Text style={[styles.starGlyph, { color: COLOR_GOLD, marginLeft: 4 }]}>
              ★
            </Text>
          ) : detail.star === "silver" ? (
            <Text
              style={[styles.starGlyph, { color: COLOR_SILVER, marginLeft: 4 }]}
            >
              ★
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.signalDetail}>{detail.compare}</Text>
    </View>
  );
}

// --- Page 4 narratives ---

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
  if (cov.topCities && cov.topCities.length > 0) {
    const topCitiesStr = cov.topCities
      .slice(0, 3)
      .map((c) => `${c.name} ${Math.round(c.pct * 100)}%`)
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
