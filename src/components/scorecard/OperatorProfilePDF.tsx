// Operator profile PDF — redesigned scorecard.
//
// Deterministic, server-rendered deal-room artifact built with
// @react-pdf/renderer (no headless browser). It consumes the SAME
// ScorecardView the live web scorecard renders (buildScorecardView →
// ScorecardView), so web + PDF can never drift on data. The route
// (src/app/api/scorecard/[slug]/pdf/route.tsx) assembles the view model
// exactly as the live page does and passes it here, plus the raw
// ScorecardData that only the methodology footer needs.
//
// Section order mirrors ScorecardBody.tsx one-for-one:
//   Header (name · cohort · market · gold/silver star readout · Dwellsy +
//           website links)
//   · 30-second exec readout
//   · 01 Scale & Fit    (view.scaleFit + view.peers)
//   · 02 Operating Performance (view.operating: 5 metric cards + concession)
//   · 03 Momentum       (view.momentum: takeaway + sparkline small-multiples)
//   · 04 Watch Items    (view.watchItems)
//   · 05 Methodology & limits (from the raw scorecard — version stamp,
//           classification rationale, coverage/portfolio/sample-size tables,
//           disclaimer, suggested citation, methodology link)
//
// Rank + composite score + the old "Lending Signals" page are intentionally
// gone — they're never surfaced on a scorecard (hard rule). All numbers/labels
// come from the view model; nothing is recomputed here.
//
// @react-pdf constraints honored throughout: no CSS grid (flexbox only), no
// linear-gradient (approximated with segmented Views), no emoji (Helvetica has
// no emoji glyphs) — direction arrows are drawn as tiny SVG chevrons and the
// star glyph (★, proven in the prior PDF) is reused. Sparklines are native
// <Svg><Polyline>. Content flows across LETTER pages automatically; the footer
// is `fixed` so it repeats on every page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  Svg,
  Polyline,
  Circle,
  Rect,
  Font,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ScorecardData } from "@/lib/types";
import type {
  ScorecardView,
  MetricRow,
  OperatingView,
  ScaleFitView,
} from "@/lib/scorecard/view-model";
import type { ScoreLabel } from "@/lib/scorecard/labels";
import type { MomentumDirection } from "@/lib/scorecard/momentum";
import type { MetricTone } from "@/lib/scorecard/operating-detail";
import type { WatchItem, WatchItemKind } from "@/lib/scorecard/watch-items";
import type { SelectedPeer } from "@/lib/scorecard/peers";
import type { RentTierDetail } from "@/lib/scorecard/rent-tier";
import type { CoverageMapImage } from "@/lib/scorecard/pdf-coverage-map";
import {
  coverageMapRenderModel,
  coverageRadius,
  MAP_W,
  MAP_H,
  MAP_BOX_W,
  MAP_BOX_H,
} from "@/lib/scorecard/coverage-map-geo";

import {
  projectPropertyRows,
  type ComparableCell,
  type PropertyRowVM,
} from "@/lib/scorecard/property-detail-view";

import { styles, COLOR_TEAL, COLOR_GRID, COLOR_MUTED_2 } from "./OperatorProfilePDF.theme";

// Disable automatic mid-word hyphenation globally. @react-pdf otherwise breaks
// long words with a hyphen to fit narrow columns (e.g. the momentum sparkline
// label rendered as "OPERATING QUALI-TY"); returning the whole word forces
// clean whole-word wrapping instead. Layout-only — no content changes.
Font.registerHyphenationCallback((word) => [word]);

// Redesign-specific accent colors that don't have a brand-token equivalent —
// copied verbatim from the web redesign components so the PDF reads the same.
const C = {
  ink: "#0f1f3f", // navy headings
  body: "#2a3547", // banner / interpretation body
  slate: "#5b6577", // secondary body
  label: "#8894ac", // eyebrow / muted labels
  faint: "#a0a9ba", // tick labels
  cardBorder: "#e2e7ef",
  softBorder: "#eaeef4",
  hairline: "#f0f2f6",
  bannerBg: "#f7f9fc",
  teal700: "#155772",
  tealSoft: "#e1eef3",
  tealTint: "#f2f8fb",
  tealBorder: "#bcdae4",
  chipBorder: "#d7dce5",
  good: "#1a7f5a",
  goodSoft: "#dff3e9",
  bad: "#a63a2a",
  badSoft: "#f5e3df",
  amber: "#9a6a12",
  amberSoft: "#fbefd8",
  violet: "#6b4ea8",
  violetSoft: "#f0ecfa",
  neutralChip: "#eef0f4",
  goldStar: "#d4a017",
  silverStar: "#9aa4b2",
  trackNeutral: "#eef1f6",
  trackWarm: "#f3d9a8",
  trackCool: "#bfe3cf",
  house: "#1b6e8c",
  apt: "#d97834",
} as const;

// --- Wordmark (loaded once per lambda lifecycle, embedded as a data URL) ---
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

// --- Format helpers ---
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

// =====================================================================
//  Shared presentational primitives (mirror the redesign components)
// =====================================================================

/** Small uppercase pill; color derived from the label (mirrors LabelChip.tsx). */
function labelChipColors(label: string): { bg: string; fg: string } {
  switch (label as ScoreLabel | string) {
    case "strong":
      return { bg: C.goodSoft, fg: C.good };
    case "good":
      return { bg: C.tealSoft, fg: C.teal700 };
    case "neutral":
      return { bg: C.neutralChip, fg: C.slate };
    case "watch":
      return { bg: C.amberSoft, fg: C.amber };
    case "insufficient":
      return { bg: C.neutralChip, fg: "#8a92a2" };
    case "growing":
      return { bg: C.goodSoft, fg: C.good };
    case "declining":
      return { bg: C.badSoft, fg: C.bad };
    case "volatile":
      return { bg: C.amberSoft, fg: C.amber };
    case "stable":
      return { bg: C.neutralChip, fg: C.slate };
    case "mixed":
      return { bg: C.violetSoft, fg: C.violet };
    default:
      return { bg: C.neutralChip, fg: C.slate };
  }
}

function LabelChip({ label }: { label: ScoreLabel | string }) {
  const { bg, fg } = labelChipColors(label);
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: 8,
          fontFamily: "Helvetica-Bold",
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Numbered section header: "01  Scale & Fit" + optional trailing chip. */
function SectionHeader({
  num,
  title,
  chip,
}: {
  num: string;
  title: string;
  chip?: ScoreLabel | string;
}) {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}
    >
      <Text style={{ fontSize: 10, color: "#aab3c6", fontFamily: "Helvetica-Bold" }}>
        {num}
      </Text>
      <Text style={{ fontSize: 15, color: C.ink, fontFamily: "Helvetica-Bold" }}>
        {title}
      </Text>
      {chip != null ? <LabelChip label={chip} /> : null}
    </View>
  );
}

/** Teal left-border takeaway banner. */
function Takeaway({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: C.bannerBg,
        borderLeftWidth: 3,
        borderLeftStyle: "solid",
        borderLeftColor: COLOR_TEAL,
        borderTopRightRadius: 6,
        borderBottomRightRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 6,
        marginBottom: 12,
      }}
    >
      <Text style={{ fontSize: 10.5, color: C.body, lineHeight: 1.5 }}>
        {children}
      </Text>
    </View>
  );
}

/** Small muted uppercase eyebrow used inside cards. */
function Eyebrow({ children, style }: { children: string; style?: Style }) {
  const base: Style = {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: C.label,
    fontFamily: "Helvetica-Bold",
  };
  return <Text style={style ? [base, style] : base}>{children}</Text>;
}

/** Gold/silver star readout pill (mirrors the header chip). ★ is proven to
 *  render in Helvetica in the prior PDF. */
function StarReadout({
  goldCount,
  silverCount,
}: {
  goldCount: number;
  silverCount: number;
}) {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#ead9a8",
        backgroundColor: "#fdf7e7",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      {goldCount > 0 ? (
        <Text style={{ fontSize: 10, color: C.goldStar, letterSpacing: 1 }}>
          {"★".repeat(goldCount)}
        </Text>
      ) : null}
      <Text style={{ fontSize: 9.5, color: "#7a5c12", fontFamily: "Helvetica-Bold" }}>
        {goldCount} gold
      </Text>
      <Text style={{ fontSize: 9.5, color: "#c9cfd8" }}>·</Text>
      {silverCount > 0 ? (
        <Text style={{ fontSize: 10, color: C.silverStar, letterSpacing: 1 }}>
          {"★".repeat(silverCount)}
        </Text>
      ) : null}
      <Text style={{ fontSize: 9.5, color: "#7a5c12", fontFamily: "Helvetica-Bold" }}>
        {silverCount} silver
      </Text>
    </View>
  );
}

/** Single-color rounded badge (quadrant / market / single-market chips). */
function Badge({
  children,
  border,
  bg,
  fg,
}: {
  children: string;
  border: string;
  bg?: string;
  fg: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: border,
        backgroundColor: bg ?? "transparent",
        borderRadius: 20,
        paddingHorizontal: 9,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 9.5, color: fg }}>{children}</Text>
    </View>
  );
}

// --- Bars ---

/** clamp to [0,1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Cohort position bar: a warm→neutral→cool segmented track (approximating the
 * web gradient) with a navy marker and P25/med/P75 tick labels.
 * position is 0..1 (null → muted "n/a").
 */
function PositionBar({ position }: { position: number | null }) {
  const pct = position != null ? clamp01(position) * 100 : null;
  return (
    <View>
      {/* Bar area — relative container so the (overflowing) marker isn't
          clipped by the track's overflow:hidden. */}
      <View style={{ position: "relative", height: 8 }}>
        {/* Track + warm/cool end segments (clipped to the rounded pill). */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: 5,
            backgroundColor: C.trackNeutral,
            overflow: "hidden",
          }}
        >
          {pct != null ? (
            <>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "38%",
                  backgroundColor: C.trackWarm,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: "38%",
                  backgroundColor: C.trackCool,
                }}
              />
            </>
          ) : null}
        </View>
        {/* Marker — sibling of the clipped track so it can extend above it. */}
        {pct != null ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              left: `${pct}%`,
              marginLeft: -1.5,
              width: 3,
              height: 16,
              borderRadius: 2,
              backgroundColor: C.ink,
            }}
          />
        ) : null}
      </View>
      {/* Tick labels */}
      <View style={{ position: "relative", height: 12, marginTop: 2 }}>
        <Text style={{ position: "absolute", left: "25%", marginLeft: -8, fontSize: 7.5, color: C.faint }}>
          P25
        </Text>
        <Text style={{ position: "absolute", left: "50%", marginLeft: -8, fontSize: 7.5, color: C.faint }}>
          med
        </Text>
        <Text style={{ position: "absolute", left: "75%", marginLeft: -8, fontSize: 7.5, color: C.faint }}>
          P75
        </Text>
      </View>
      {pct == null ? (
        <Text style={{ fontSize: 8, color: C.faint, fontStyle: "italic" }}>n/a</Text>
      ) : null}
    </View>
  );
}

const TONE_FILL: Record<MetricTone, string> = {
  good: "#2f9e6b",
  watch: "#d97834",
  neutral: "#8ea0bd",
};

/** Magnitude fill (0→value) + peer-median tick, colored by tone. */
function ComparisonBar({
  value,
  median,
  tone,
}: {
  value: number;
  median: number | null;
  tone: MetricTone;
}) {
  const scaleMax = Math.max(value, median ?? 0) * 1.3 || 1;
  const valuePct = Math.max(0, Math.min(100, (value / scaleMax) * 100));
  const medianPct =
    median != null ? Math.max(0, Math.min(100, (median / scaleMax) * 100)) : null;
  return (
    <View style={{ position: "relative", height: 8 }}>
      {/* Track + magnitude fill (clipped to the rounded pill). */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: 5,
          backgroundColor: C.trackNeutral,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${valuePct}%`,
            backgroundColor: TONE_FILL[tone],
          }}
        />
      </View>
      {/* Peer-median tick — sibling of the clipped track so it can extend
          slightly above/below it. */}
      {medianPct != null ? (
        <View
          style={{
            position: "absolute",
            left: `${medianPct}%`,
            marginLeft: -1,
            top: -2,
            bottom: -2,
            width: 2,
            backgroundColor: C.slate,
          }}
        />
      ) : null}
    </View>
  );
}

// --- Sparklines ---

function sparkStroke(direction: MomentumDirection): string {
  switch (direction) {
    case "growing":
      return C.good;
    case "declining":
      return C.bad;
    case "volatile":
      return C.amber;
    default:
      return "#8a92a2";
  }
}

/** Map a numeric series into "x,y" polyline points in a 0..100 × 0..30 box. */
function sparkPoints(series: number[]): string {
  const W = 100;
  const H = 30;
  const PAD = 4;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = series.length > 1 ? W / (series.length - 1) : 0;
  return series
    .map((v, i) => {
      const x = i * step;
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Sparkline({
  series,
  direction,
}: {
  series: number[];
  direction: MomentumDirection;
}) {
  const W = 88;
  const H = 26;
  if (series.length < 2) {
    return (
      <Svg width={W} height={H} viewBox="0 0 100 30">
        <Polyline points="0,15 100,15" fill="none" stroke="#d5dbe3" strokeWidth={2} />
      </Svg>
    );
  }
  return (
    <Svg width={W} height={H} viewBox="0 0 100 30">
      <Polyline
        points={sparkPoints(series)}
        fill="none"
        stroke={sparkStroke(direction)}
        strokeWidth={2}
      />
    </Svg>
  );
}

/** Tiny SVG chevron/dash conveying momentum direction (no emoji glyphs). */
function DirGlyph({ direction }: { direction: MomentumDirection }) {
  const stroke =
    direction === "growing"
      ? C.good
      : direction === "declining"
        ? C.bad
        : direction === "volatile"
          ? C.amber
          : C.slate;
  let points: string | null = null;
  switch (direction) {
    case "growing":
      points = "1,4 4,1 7,4";
      break;
    case "declining":
      points = "1,1 4,4 7,1";
      break;
    case "stable":
      points = "1,3 7,3";
      break;
    case "volatile":
      points = "1,4 2.5,1 4,4 5.5,1 7,4";
      break;
    default:
      points = null;
  }
  if (points == null) return null;
  return (
    <Svg width={8} height={6} viewBox="0 0 8 6">
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={1.3} />
    </Svg>
  );
}

// =====================================================================
//  Header
// =====================================================================

function ScorecardHeaderBlock({
  header,
  logoDataUrl,
}: {
  header: ScorecardView["header"];
  logoDataUrl: string | null;
}) {
  return (
    <View>
      {/* Brand row */}
      <View style={styles.brandRow}>
        {logoDataUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoDataUrl} style={{ width: 120, height: 38 }} />
        ) : (
          <Text style={styles.brandText}>Dwellsy IQ</Text>
        )}
        <Text style={styles.brandSep}>·</Text>
        <Text style={styles.brandEyebrow}>Property Manager Scorecard</Text>
      </View>

      {/* Identity row: name + badges (left) · star readout (right) */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 24,
              color: C.ink,
              fontFamily: "Helvetica-Bold",
              letterSpacing: -0.3,
            }}
          >
            {header.name}
          </Text>
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {header.quadrant7Cell != null ? (
              <Badge border={C.tealBorder} bg={C.tealSoft} fg={C.teal700}>
                {header.quadrant7Cell}
              </Badge>
            ) : null}
            <Badge border={C.chipBorder} fg="#3a4a6b">
              {header.marketFullName}
            </Badge>
            {header.singleMarket ? (
              <Badge border={C.chipBorder} fg="#3a4a6b">
                Single-market
              </Badge>
            ) : null}
          </View>
        </View>
        <StarReadout
          goldCount={header.goldCount}
          silverCount={header.silverCount}
        />
      </View>

      {/* Link row — Dwellsy company + operator website. These are the
          client-requested links, so both the label and the actual URL render
          as visible, clickable text. */}
      {(header.dwellsyCompanyUrl != null || header.website != null) && (
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          {header.dwellsyCompanyUrl != null ? (
            <LinkChip
              label="View listings on Dwellsy »"
              url={header.dwellsyCompanyUrl}
              teal
            />
          ) : null}
          {header.website != null ? (
            <LinkChip label="Operator website »" url={header.website} />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Bordered link chip. The label + the raw URL are both clickable <Link>s. */
function LinkChip({
  label,
  url,
  teal = false,
}: {
  label: string;
  url: string;
  teal?: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: teal ? C.tealBorder : C.chipBorder,
        backgroundColor: teal ? C.tealTint : "#ffffff",
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Link
        src={url}
        style={{
          fontSize: 10,
          color: teal ? C.teal700 : "#3a4a6b",
          fontFamily: "Helvetica-Bold",
          textDecoration: "none",
        }}
      >
        {label}
      </Link>
      <Link
        src={url}
        style={{ fontSize: 7.5, color: COLOR_TEAL, marginTop: 2, textDecoration: "none" }}
      >
        {url}
      </Link>
    </View>
  );
}

// =====================================================================
//  30-second exec readout
// =====================================================================

function ExecReadout({
  readout,
  maturityNote,
}: {
  readout: ScorecardView["readout"];
  maturityNote: string | null;
}) {
  return (
    <View style={{ marginTop: 18, marginBottom: 4 }}>
      <Eyebrow style={{ marginBottom: 6 }}>30-second readout</Eyebrow>
      <View
        style={{
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "#e0e5ee",
          borderRadius: 8,
          overflow: "hidden",
        }}
        wrap={false}
      >
        {readout.map((row, i) => (
          <View
            key={row.area}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopStyle: "solid",
              borderTopColor: "#eef1f6",
              backgroundColor: i === 0 ? C.bannerBg : "#ffffff",
            }}
          >
            <View style={{ width: 150 }}>
              <Text style={{ fontSize: 10, color: C.ink, fontFamily: "Helvetica-Bold" }}>
                {row.area}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: 10, color: "#1e2a3d", lineHeight: 1.4 }}>
              {row.value || "—"}
            </Text>
            {row.label != null ? <LabelChip label={row.label} /> : null}
          </View>
        ))}
      </View>
      {maturityNote != null ? (
        <Text style={{ fontSize: 8.5, color: C.label, marginTop: 6 }}>
          {maturityNote}
        </Text>
      ) : null}
    </View>
  );
}

// =====================================================================
//  01 Scale & Fit
// =====================================================================

/** Full-width portfolio range bar: observed tick (green) + estimate band +
 *  best-estimate point marker, with a numeric legend below. */
function PortfolioRangeBar({
  estimate,
  observedUnits,
}: {
  estimate: ScaleFitView["estimate"];
  observedUnits: number | null;
}) {
  const { point, low, high, status, message } = estimate;
  const hasBand = low != null && high != null;

  if (point == null && !hasBand) {
    const friendly =
      message ??
      (status === "insufficient_data"
        ? "Not enough observed data to estimate portfolio size yet."
        : status);
    return (
      <View style={cardBox} wrap={false}>
        <Eyebrow>Portfolio size</Eyebrow>
        <Text style={{ fontSize: 10, color: C.label, marginTop: 6 }}>{friendly}</Text>
      </View>
    );
  }

  const upperBound = Math.max(point ?? 0, high ?? 0, observedUnits ?? 0, 1) * 1.25;
  const toPct = (v: number) => Math.min(100, Math.max(0, (v / upperBound) * 100));
  const bandLeft = hasBand ? toPct(low!) : null;
  const bandWidth = hasBand ? toPct(high!) - toPct(low!) : null;
  const pointLeft = point != null ? toPct(point) : null;
  const obsLeft = observedUnits != null ? toPct(observedUnits) : null;

  return (
    <View style={cardBox} wrap={false}>
      <Eyebrow>Portfolio size</Eyebrow>
      {/* Track */}
      <View
        style={{
          position: "relative",
          height: 12,
          borderRadius: 7,
          backgroundColor: C.trackNeutral,
          marginTop: 12,
          marginBottom: 8,
        }}
      >
        {hasBand ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${bandLeft}%`,
              width: `${bandWidth}%`,
              backgroundColor: "#cfe3ec",
              borderRadius: 7,
            }}
          />
        ) : null}
        {obsLeft != null ? (
          <View
            style={{
              position: "absolute",
              top: -3,
              left: `${obsLeft}%`,
              marginLeft: -1,
              width: 2,
              height: 18,
              backgroundColor: C.good,
            }}
          />
        ) : null}
        {pointLeft != null ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              left: `${pointLeft}%`,
              marginLeft: -1.5,
              width: 3,
              height: 20,
              borderRadius: 2,
              backgroundColor: C.ink,
            }}
          />
        ) : null}
      </View>
      {/* Numeric legend */}
      <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {observedUnits != null ? (
          <Text style={{ fontSize: 9, color: C.good, fontFamily: "Helvetica-Bold" }}>
            {fmtInt(observedUnits)} observed
          </Text>
        ) : null}
        {point != null ? (
          <Text style={{ fontSize: 9, color: C.ink, fontFamily: "Helvetica-Bold" }}>
            {fmtInt(point)} est.
          </Text>
        ) : null}
        {hasBand ? (
          <Text style={{ fontSize: 9, color: C.slate }}>
            Range {fmtInt(low!)}–{fmtInt(high!)}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 8.5, color: C.label, marginTop: 6, lineHeight: 1.4 }}>
        {hasBand
          ? "Green = directly observed units (T12). Band = plausible range from unit-turnover uncertainty. Point = best estimate (turnover-adjusted)."
          : "Green = directly observed units (T12). Point = estimated managed units (turnover-adjusted for SFR; declared units for multifamily)."}
      </Text>
    </View>
  );
}

/** Stacked top-cities concentration bar + a concentration-vs-peers caption. */
function ConcentrationBar({
  topCities,
  top3Share,
  cohortTop3,
}: {
  topCities: ScaleFitView["topCities"];
  top3Share: number | null;
  cohortTop3: number | null;
}) {
  if (!topCities || topCities.length === 0) {
    return (
      <Text style={{ fontSize: 9, color: C.label }}>
        Geographic breakdown not available.
      </Text>
    );
  }
  const cityColors = ["#155772", "#1b6e8c", "#4a90a8"];
  const named = topCities.slice(0, 3);
  const namedSum = named.reduce((s, c) => s + c.pct, 0);
  const otherPct = Math.max(0, 100 - namedSum);

  let caption: string | null = null;
  if (top3Share != null) {
    const topPct = Math.round(top3Share * 100);
    if (cohortTop3 != null) {
      const cohortPct = Math.round(cohortTop3 * 100);
      const delta = topPct - cohortPct;
      const dir =
        Math.abs(delta) <= 2
          ? "in line with peers"
          : delta > 0
            ? "more concentrated than peers"
            : "less concentrated than peers";
      caption = `Top-3 share ${topPct}% vs cohort median ${cohortPct}% — ${dir}.`;
    } else {
      caption = `Top-3 share ${topPct}% of portfolio.`;
    }
  }

  return (
    <View>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          height: 18,
          borderRadius: 5,
          overflow: "hidden",
          marginTop: 6,
          marginBottom: 4,
        }}
      >
        {named.map((city, i) => (
          <View
            key={city.name}
            style={{
              width: `${city.pct}%`,
              backgroundColor: cityColors[i] ?? cityColors[cityColors.length - 1],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {city.pct > 12 ? (
              <Text style={{ fontSize: 7, color: "#ffffff" }}>
                {`${city.name.length > 9 ? city.name.slice(0, 8) + "." : city.name} ${Math.round(city.pct)}%`}
              </Text>
            ) : null}
          </View>
        ))}
        {otherPct > 0 ? (
          <View
            style={{
              width: `${otherPct}%`,
              backgroundColor: "#9ec4d2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {otherPct > 12 ? (
              <Text style={{ fontSize: 7, color: C.teal700 }}>other</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {caption != null ? (
        <Text style={{ fontSize: 8.5, color: C.label }}>{caption}</Text>
      ) : null}
    </View>
  );
}

function CoverageMapBlock({
  coverageMap,
  geo,
}: {
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
  const model = coverageMapRenderModel(coverageMap, geo);
  if (model.mode === "empty") return null;

  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <Eyebrow style={{ marginBottom: 6 }}>Coverage</Eyebrow>
      <View
        style={{
          position: "relative",
          width: MAP_BOX_W,
          height: MAP_BOX_H,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: COLOR_GRID,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {model.mode === "basemap" ? (
          <Image
            src={model.imageSrc}
            style={{ position: "absolute", top: 0, left: 0, width: MAP_BOX_W, height: MAP_BOX_H }}
          />
        ) : null}
        <Svg
          style={{ position: "absolute", top: 0, left: 0 }}
          width={MAP_BOX_W}
          height={MAP_BOX_H}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        >
          {model.mode === "fallback" ? (
            <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#F2F5F8" />
          ) : null}
          {model.backdrop.map((p, i) => (
            <Circle key={`b${i}`} cx={p.x} cy={p.y} r={1.8} fill="#B8C2D1" opacity={0.28} />
          ))}
          {model.coverage.map((p, i) => (
            <Circle
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={coverageRadius(p.n)}
              fill={COLOR_TEAL}
              fillOpacity={0.7}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      </View>
      <Text style={{ fontSize: 7.5, color: COLOR_MUTED_2, marginTop: 4 }}>
        {model.mode === "basemap"
          ? "Basemap © Mapbox © OpenStreetMap"
          : "Coverage footprint (basemap unavailable)"}
      </Text>
    </View>
  );
}

/** Value→premium gradient track (segmented) with a marker + rent captions. */
function RentTierMarker({ detail }: { detail: RentTierDetail | null }) {
  if (detail == null) {
    return (
      <Text style={{ fontSize: 9, color: C.faint, marginTop: 6 }}>
        Rent tier data not yet available.
      </Text>
    );
  }
  const clamped = clamp01(detail.position);
  const leftPct = clamped * 100;
  const tierWord =
    clamped < 0.33 ? "value" : clamped < 0.67 ? "mid-market" : "premium";
  const line2 =
    detail.marketP25 != null && detail.marketP75 != null
      ? `Market P25 $${fmtInt(detail.marketP25)} – P75 $${fmtInt(detail.marketP75)} · other operators in the MSA`
      : null;

  return (
    <View>
      {/* Track: value (green) → mid (blue) → premium (violet). The marker is
          a sibling of the clipped segment row so it can extend above it. */}
      <View style={{ position: "relative", height: 10, marginTop: 16, marginBottom: 6 }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "row",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <View style={{ flexGrow: 34, flexBasis: 0, backgroundColor: "#dff0e5" }} />
          <View style={{ flexGrow: 33, flexBasis: 0, backgroundColor: C.tealSoft }} />
          <View style={{ flexGrow: 33, flexBasis: 0, backgroundColor: C.violetSoft }} />
        </View>
        <View
          style={{
            position: "absolute",
            top: -3,
            left: `${leftPct}%`,
            marginLeft: -1.5,
            width: 3,
            height: 16,
            borderRadius: 2,
            backgroundColor: C.ink,
          }}
        />
      </View>
      <Text style={{ fontSize: 8.5, color: C.label }}>
        {`~$${fmtInt(detail.rentMedian)}/mo median${detail.sampleSize != null ? ` (from ${detail.sampleSize} recent listing${detail.sampleSize === 1 ? "" : "s"})` : ""} · ${tierWord} end`}
      </Text>
      {line2 != null ? (
        <Text style={{ fontSize: 8, color: C.label, marginTop: 2 }}>{line2}</Text>
      ) : null}
    </View>
  );
}

/** House / apartment stacked split bar. */
function UnitMixBar({ unitMix }: { unitMix: NonNullable<ScaleFitView["unitMix"]> }) {
  const { houseUrus, aptUrus } = unitMix;
  const total = houseUrus + aptUrus;
  if (total <= 0) return null;
  const housePct = Math.round((houseUrus / total) * 100);
  const aptPct = Math.round((aptUrus / total) * 100);
  return (
    <View style={cardBox} wrap={false}>
      <Eyebrow style={{ marginBottom: 6 }}>House vs apartment split</Eyebrow>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          height: 16,
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        {houseUrus > 0 ? (
          <View
            style={{
              width: `${housePct}%`,
              backgroundColor: C.house,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" }}>
              {housePct}%
            </Text>
          </View>
        ) : null}
        {aptUrus > 0 ? (
          <View
            style={{
              width: `${aptPct}%`,
              backgroundColor: C.apt,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" }}>
              {aptPct}%
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <Text style={{ fontSize: 9, color: C.slate }}>
          Houses · {fmtInt(houseUrus)} units
        </Text>
        <Text style={{ fontSize: 9, color: C.slate }}>
          Apartments · {fmtInt(aptUrus)} units
        </Text>
      </View>
    </View>
  );
}

/** One labelled fact for the "At a glance" strip. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginRight: 22, marginBottom: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ fontSize: 11, color: C.ink, fontFamily: "Helvetica-Bold", marginTop: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function PeersTable({
  peers,
}: {
  peers: SelectedPeer[];
}) {
  if (peers.length === 0) return null;
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Eyebrow style={{ marginBottom: 6 }}>Similar local players</Eyebrow>
      {/* Header */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
          borderBottomColor: "#e6eaf1",
          paddingBottom: 4,
        }}
      >
        <Text style={[peerHeadCell, { flex: 3 }]}>Operator</Text>
        <Text style={[peerHeadCell, { flex: 1.3, textAlign: "right" }]}>Est. size</Text>
        <Text style={[peerHeadCell, { flex: 1.8 }]}>Type</Text>
        <Text style={[peerHeadCell, { flex: 1.5 }]}>Operating perf.</Text>
      </View>
      {peers.map((peer) => (
        <View
          key={peer.slug}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 4,
            borderBottomWidth: 0.5,
            borderBottomStyle: "solid",
            borderBottomColor: C.hairline,
            backgroundColor: peer.isFocal ? "#eef4f7" : "transparent",
          }}
        >
          <Text
            style={[
              peerCell,
              {
                flex: 3,
                color: peer.isFocal ? C.ink : "#374356",
                fontFamily: peer.isFocal ? "Helvetica-Bold" : "Helvetica",
              },
            ]}
          >
            {peer.name}
            {peer.isFocal ? "  (this operator)" : ""}
          </Text>
          <Text style={[peerCell, { flex: 1.3, textAlign: "right" }]}>
            {peer.estimatedUnits != null ? fmtInt(peer.estimatedUnits) : "—"}
          </Text>
          <Text style={[peerCell, { flex: 1.8 }]}>{peer.quadrant7Cell ?? "—"}</Text>
          <View style={{ flex: 1.5 }}>
            <LabelChip label={peer.operatingLabel} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ScaleFitSection({
  scaleFit,
  peers,
  coverageMap,
  geo,
}: {
  scaleFit: ScaleFitView;
  peers: SelectedPeer[];
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
  const facts: Array<{ label: string; value: string }> = [];
  if (scaleFit.propertyType != null) facts.push({ label: "Type", value: scaleFit.propertyType });
  if (scaleFit.citiesObserved != null)
    facts.push({ label: "Cities", value: String(scaleFit.citiesObserved) });
  if (scaleFit.communitiesObserved != null)
    facts.push({ label: "Communities", value: String(scaleFit.communitiesObserved) });
  facts.push({ label: "Footprint", value: scaleFit.singleMarket ? "1 market" : "Multi-market" });
  if (scaleFit.observedUnits != null)
    facts.push({ label: "Observed", value: fmtInt(scaleFit.observedUnits) });
  if (scaleFit.tenure != null)
    facts.push({
      label: "Tenure",
      value: `${scaleFit.tenure.yearsVisible.toFixed(1)}y · ${scaleFit.tenure.marketCount} market${scaleFit.tenure.marketCount === 1 ? "" : "s"}`,
    });

  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <SectionHeader num="01" title="Scale & Fit" />
        <Takeaway>{scaleFit.takeaway}</Takeaway>
      </View>

      <PortfolioRangeBar estimate={scaleFit.estimate} observedUnits={scaleFit.observedUnits} />

      {/* At a glance */}
      <View style={cardBox} wrap={false}>
        <Eyebrow style={{ marginBottom: 6 }}>At a glance</Eyebrow>
        <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap" }}>
          {facts.map((f) => (
            <Fact key={f.label} label={f.label} value={f.value} />
          ))}
        </View>
      </View>

      {/* Geographic concentration */}
      <View style={cardBox} wrap={false}>
        <Eyebrow style={{ marginBottom: 4 }}>Geographic concentration</Eyebrow>
        <ConcentrationBar
          topCities={scaleFit.topCities}
          top3Share={scaleFit.top3Share}
          cohortTop3={scaleFit.cohortTop3}
        />
      </View>

      {/* Coverage map */}
      <CoverageMapBlock coverageMap={coverageMap} geo={geo} />

      {/* Rent tier */}
      <View style={cardBox} wrap={false}>
        <Eyebrow>Rent tier</Eyebrow>
        <RentTierMarker detail={scaleFit.rentTier} />
      </View>

      {scaleFit.unitMix != null ? <UnitMixBar unitMix={scaleFit.unitMix} /> : null}

      {scaleFit.crossMarket != null ? (
        <View style={cardBox} wrap={false}>
          <Eyebrow style={{ marginBottom: 4 }}>Also operates in</Eyebrow>
          <Text style={{ fontSize: 10.5, color: COLOR_TEAL, fontFamily: "Helvetica-Bold" }}>
            {scaleFit.crossMarket.marketNames.slice(0, 4).join(" · ")}
            {scaleFit.crossMarket.marketNames.length > 4
              ? ` +${scaleFit.crossMarket.marketNames.length - 4} more`
              : ""}
          </Text>
        </View>
      ) : null}

      <PeersTable peers={peers} />
    </View>
  );
}

// =====================================================================
//  02 Operating Performance
// =====================================================================

function StarText({ star }: { star: MetricRow["star"] }) {
  if (!star) return null;
  return (
    <Text style={{ fontSize: 11, color: star === "gold" ? C.goldStar : C.silverStar }}>
      ★
    </Text>
  );
}

function SwChips({ strongest, watch }: { strongest: string[]; watch: string[] }) {
  if (strongest.length === 0 && watch.length === 0) return null;
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        marginBottom: 12,
      }}
    >
      {strongest.length > 0 ? (
        <Text style={{ fontSize: 9.5, color: C.slate }}>Strongest:</Text>
      ) : null}
      {strongest.map((name) => (
        <View key={`s-${name}`} style={swChipBox}>
          <Text style={{ fontSize: 9, color: C.good, fontFamily: "Helvetica-Bold" }}>{name}</Text>
        </View>
      ))}
      {watch.length > 0 ? (
        <Text style={{ fontSize: 9.5, color: C.slate, marginLeft: strongest.length > 0 ? 4 : 0 }}>
          Watch:
        </Text>
      ) : null}
      {watch.map((name) => (
        <View key={`w-${name}`} style={swChipBox}>
          <Text style={{ fontSize: 9, color: C.slate, fontFamily: "Helvetica-Bold" }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

function MetricCard({ metric }: { metric: MetricRow }) {
  return (
    <View style={metricCardBox} wrap={false}>
      {/* Header */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 5,
        }}
      >
        <Text style={{ fontSize: 12, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          {metric.title}
        </Text>
        <StarText star={metric.star} />
        <View style={{ flex: 1 }} />
        <LabelChip label={metric.label} />
      </View>
      {/* Interpretation */}
      {metric.interpretation || metric.benchmark ? (
        <Text style={{ fontSize: 10, color: C.body, marginBottom: 10, lineHeight: 1.4 }}>
          {metric.interpretation || metric.benchmark}
        </Text>
      ) : null}
      {/* Evidence: big value + position bar */}
      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 66 }}>
          <Text style={{ fontSize: 20, color: C.ink, fontFamily: "Helvetica-Bold" }}>
            {metric.value}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <PositionBar position={metric.position} />
        </View>
      </View>
      {/* Sub strip */}
      {metric.sub.length > 0 ? (
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 14,
            marginTop: 10,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: C.hairline,
          }}
        >
          {metric.sub.map((s, i) => (
            <Text key={i} style={{ fontSize: 9, color: C.slate }}>
              {s}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ConcessionCard({
  concession,
}: {
  concession: NonNullable<OperatingView["concession"]>;
}) {
  return (
    <View style={metricCardBox} wrap={false}>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 5,
        }}
      >
        <Text style={{ fontSize: 12, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          Concessions
        </Text>
        <View style={{ flex: 1 }} />
        <LabelChip label={concession.tone === "neutral" ? "in line" : concession.tone} />
      </View>
      {concession.interpretation ? (
        <Text style={{ fontSize: 10, color: C.body, marginBottom: 10, lineHeight: 1.4 }}>
          {concession.interpretation}
        </Text>
      ) : null}
      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 66 }}>
          <Text style={{ fontSize: 20, color: C.ink, fontFamily: "Helvetica-Bold" }}>
            {concession.ratePct.toFixed(1)}%
          </Text>
          <Eyebrow style={{ marginTop: 2 }}>of listings</Eyebrow>
        </View>
        <View style={{ flex: 1 }}>
          <ComparisonBar
            value={concession.ratePct}
            median={concession.marketRatePct}
            tone={concession.tone}
          />
        </View>
      </View>
      <Text
        style={{
          fontSize: 8.5,
          color: C.label,
          marginTop: 10,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopStyle: "solid",
          borderTopColor: C.hairline,
          lineHeight: 1.4,
        }}
      >
        {concession.definition}
      </Text>
      {concession.patterns.length > 0 ? (
        <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {concession.patterns.map((p) => (
            <View key={p} style={swChipBox}>
              <Text style={{ fontSize: 9, color: C.slate }}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {concession.samples.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {concession.samples.slice(0, 3).map((s, i) => (
            <View
              key={i}
              style={{
                borderLeftWidth: 2,
                borderLeftStyle: "solid",
                borderLeftColor: C.cardBorder,
                paddingLeft: 8,
                marginTop: 3,
              }}
            >
              <Text style={{ fontSize: 9, color: C.label, fontStyle: "italic", lineHeight: 1.4 }}>
                {s}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OperatingSection({ operating }: { operating: OperatingView }) {
  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <SectionHeader num="02" title="Operating Performance" chip={operating.sectionLabel} />
        <Takeaway>{operating.takeaway}</Takeaway>
      </View>
      <SwChips strongest={operating.strongest} watch={operating.watch} />
      {operating.metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}
      {operating.concession != null ? <ConcessionCard concession={operating.concession} /> : null}
    </View>
  );
}

// =====================================================================
//  03 Momentum
// =====================================================================

function SparkCell({
  spark,
}: {
  spark: ScorecardView["momentum"]["sparklines"][number];
}) {
  return (
    <View
      style={{
        width: 118,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: C.cardBorder,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginRight: 8,
        marginBottom: 8,
      }}
      wrap={false}
    >
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 4,
          marginBottom: 6,
          // Reserve two label lines so the sparklines below line up across the
          // row even when a label wraps ("Operating quality", "Geographic
          // reach"). Hyphenation is disabled globally, so labels wrap on spaces.
          minHeight: 20,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 8,
            color: C.slate,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            lineHeight: 1.2,
            fontFamily: "Helvetica-Bold",
          }}
        >
          {spark.label}
        </Text>
        <DirGlyph direction={spark.direction} />
      </View>
      {spark.direction === "insufficient" ? (
        <View style={{ height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 8.5, color: "#8a92a2", fontStyle: "italic" }}>
            building history
          </Text>
        </View>
      ) : (
        <Sparkline series={spark.series} direction={spark.direction} />
      )}
    </View>
  );
}

function MomentumSection({ momentum }: { momentum: ScorecardView["momentum"] }) {
  const cells = momentum.sparklines.filter(
    (s) => s.key !== "footprint" || s.series.length > 0
  );
  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <SectionHeader
          num="03"
          title="Momentum"
          chip={momentum.direction === "insufficient" ? undefined : momentum.direction}
        />
        <Takeaway>{momentum.takeaway}</Takeaway>
      </View>
      <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((s) => (
          <SparkCell key={s.key} spark={s} />
        ))}
      </View>
    </View>
  );
}

// =====================================================================
//  04 Watch Items
// =====================================================================

const WATCH_KIND: Record<
  WatchItemKind,
  { label: string; color: string; border: string }
> = {
  risk: { label: "Risk", color: "#a13a3a", border: "#c0504d" },
  data: { label: "Data limitation", color: "#9a6a12", border: "#c99a2e" },
  context: { label: "Context", color: C.slate, border: "#9aa4b2" },
  positive: { label: "Positive", color: C.good, border: "#3f9c6d" },
};

function WatchRow({ item }: { item: WatchItem }) {
  const cfg = WATCH_KIND[item.kind];
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        borderLeftWidth: 4,
        borderLeftStyle: "solid",
        borderLeftColor: cfg.border,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: "#fcfdfe",
        marginBottom: 8,
      }}
      wrap={false}
    >
      <View style={{ width: 110, paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text
          style={{
            fontSize: 9,
            color: cfg.color,
            fontFamily: "Helvetica-Bold",
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          {cfg.label}
        </Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 12 }}>
        <Text style={{ fontSize: 11, color: C.ink, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
          {item.headline}
        </Text>
        <Text style={{ fontSize: 10, color: "#465066", lineHeight: 1.4 }}>
          {item.explanation}
        </Text>
        {item.ask ? (
          <View
            style={{
              backgroundColor: "#fbf2ea",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 9.5, color: "#8a4b2a", lineHeight: 1.4 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: "#7a3f22" }}>Ask: </Text>
              {item.ask}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function WatchItemsSection({ items }: { items: WatchItem[] }) {
  const reviewCount = items.filter((i) => i.kind !== "positive").length;
  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <Text style={{ fontSize: 10, color: "#aab3c6", fontFamily: "Helvetica-Bold" }}>04</Text>
          <Text style={{ fontSize: 15, color: C.ink, fontFamily: "Helvetica-Bold" }}>
            Watch Items
          </Text>
          <View
            style={{
              backgroundColor: C.neutralChip,
              borderRadius: 20,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 8.5, color: C.slate, fontFamily: "Helvetica-Bold" }}>
              {reviewCount} to review
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 10, color: C.slate, marginBottom: 12, lineHeight: 1.45 }}>
          Signals that need a human read before you hire, monitor, or acquire — some are risks
          worth a follow-up, some are neutral context, some are positives.
        </Text>
      </View>
      {items.length === 0 ? (
        <View
          style={{
            borderLeftWidth: 4,
            borderLeftStyle: "solid",
            borderLeftColor: "#3f9c6d",
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            backgroundColor: "#f4faf6",
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
          wrap={false}
        >
          <Text style={{ fontSize: 10.5, color: C.good, lineHeight: 1.4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>No flags. </Text>
            Clean across the concession, coverage, geography, graded-metric, and
            trajectory signals we check.
          </Text>
        </View>
      ) : (
        items.map((item, i) => <WatchRow key={`${item.kind}-${i}`} item={item} />)
      )}
    </View>
  );
}

// =====================================================================
//  05 Properties (property-level detail) — mirrors PropertyDetailSection.tsx
// =====================================================================

// The PDF is a fixed artifact, so a huge scattered-SFR operator (max ~122
// submarket rows) would balloon it. Cap at the highest-listing-volume rows —
// ~95% of operators have ≤26 properties, so most show in full; the rest get an
// explicit footnote pointing to the in-app export for the complete list.
const MAX_PDF_PROPERTY_ROWS = 30;

function propDisplayLabel(row: PropertyRowVM): string {
  // Scattered-SFR rows are submarket rollups, not single addresses.
  return row.kind === "sfr-submarket"
    ? `SFR · ${row.submarket ?? row.label}`
    : row.label;
}
function fmtRentValue(n: number): string {
  return `$${fmtInt(n)}`;
}
function fmtDomValue(n: number): string {
  return String(Math.round(n));
}
function fmtConcessionValue(n: number): string {
  return fmtPct(n * 100, 0);
}
function fmtRentYoyValue(n: number): string {
  return fmtPct(n * 100, 1, true);
}

/** A comparable metric cell: operator value (toned by deltaSign, never on a
 *  neutral/null sign) with the MSA-median comp beneath it. No scores. */
function PropComparable({
  cell,
  format,
}: {
  cell: ComparableCell;
  format: (n: number) => string;
}) {
  if (cell.value == null) {
    return <Text style={{ fontSize: 9, color: C.faint }}>—</Text>;
  }
  const color =
    cell.deltaSign === "better" ? C.good : cell.deltaSign === "worse" ? C.bad : C.ink;
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ fontSize: 9, color, fontFamily: "Helvetica-Bold" }}>
        {format(cell.value)}
      </Text>
      {cell.comp != null ? (
        <Text style={{ fontSize: 6.5, color: C.label, marginTop: 1 }}>
          mkt {format(cell.comp)}
        </Text>
      ) : null}
    </View>
  );
}

const propCell = { fontSize: 9, color: "#374356", paddingHorizontal: 3 };

function PropertyRowCells({ row }: { row: PropertyRowVM }) {
  const sizeText =
    row.kind === "community"
      ? row.units != null
        ? `${fmtInt(row.units)} units`
        : "—"
      : row.homes != null
        ? `${fmtInt(row.homes)} homes`
        : "—";
  return (
    <View style={[styles.tableRow, { alignItems: "flex-start" }]} wrap={false}>
      <Text style={[propCell, { flex: 2.6 }]}>{propDisplayLabel(row)}</Text>
      <Text style={[propCell, { flex: 1.3, textAlign: "right" }]}>{sizeText}</Text>
      <Text style={[propCell, { flex: 0.8, textAlign: "right" }]}>{fmtInt(row.nListings)}</Text>
      <View style={{ flex: 1.5, alignItems: "flex-end", paddingHorizontal: 3 }}>
        <PropComparable cell={row.medianDomT12} format={fmtDomValue} />
      </View>
      <View style={{ flex: 2.0, alignItems: "flex-end", paddingHorizontal: 3 }}>
        <PropComparable cell={row.medianRentT12} format={fmtRentValue} />
        <View style={{ height: 2 }} />
        <PropComparable cell={row.rentYoY} format={fmtRentYoyValue} />
      </View>
      <View style={{ flex: 1.4, alignItems: "flex-end", paddingHorizontal: 3 }}>
        <PropComparable cell={row.concessionRate} format={fmtConcessionValue} />
      </View>
      <Text style={[propCell, { flex: 1.0, textAlign: "right" }]}>
        {row.listingQuality != null ? fmtInt(Math.round(row.listingQuality)) : "—"}
      </Text>
    </View>
  );
}

function PropertiesSection({
  scorecard,
  num,
}: {
  scorecard: ScorecardData;
  num: string;
}) {
  const block = scorecard.propertyDetail;
  if (!block?.properties?.length) return null;

  const allRows = projectPropertyRows(block);
  const total = allRows.length;
  // Highest listing-volume first (mirrors the web table's default sort) and
  // capped for the fixed artifact.
  const rows = [...allRows]
    .sort((a, b) => b.nListings - a.nListings)
    .slice(0, MAX_PDF_PROPERTY_ROWS);
  const truncated = total > rows.length;

  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <SectionHeader num={num} title="Properties" />
        <Text
          style={{
            fontSize: 10,
            color: C.slate,
            marginTop: 2,
            marginBottom: 10,
            lineHeight: 1.45,
          }}
        >
          Per-property observations vs. the MSA median (&ldquo;mkt&rdquo;) — descriptive,
          not scored. Scattered single-family holdings are grouped into submarket rollups
          rather than shown per address.
        </Text>
      </View>

      {/* Header row (kept with the first data row so it never strands). */}
      <View wrap={false}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { flex: 2.6 }]}>Property / Community</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: "right" }]}>Units / Homes</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: "right" }]}>Listings</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: "right" }]}>Median DOM</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2.0, textAlign: "right" }]}>Rent + YoY</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.4, textAlign: "right" }]}>Concession</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.0, textAlign: "right" }]}>Quality</Text>
        </View>
        {rows.length > 0 ? <PropertyRowCells row={rows[0]} /> : null}
      </View>
      {rows.slice(1).map((row, i) => (
        <PropertyRowCells key={`${row.kind}-${row.label}-${i + 1}`} row={row} />
      ))}
      {truncated ? (
        <Text style={{ fontSize: 8, color: C.label, marginTop: 6, lineHeight: 1.4 }}>
          {`Showing the ${rows.length} highest-volume of ${total} properties. The full list is available in the in-app Properties export.`}
        </Text>
      ) : null}
    </View>
  );
}

// =====================================================================
//  Page chrome (footer + running header) — reused from the prior PDF
// =====================================================================

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
        <Text
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
        {" · "}
        <Text style={styles.footerLink}>iq.dwellsy.com</Text>
      </Text>
    </View>
  );
}

/**
 * Compact running header, `fixed` so it repeats on every physical page. The
 * content is emitted only on pages 2+ (via the `render` callback) — page 1
 * carries the full branded masthead instead. It's absolutely positioned in the
 * page's top margin (above the flowing content, which starts at the page's
 * paddingTop), matching how the footer sits in the bottom margin.
 */
function RunningHeader({ scorecard }: { scorecard: ScorecardData }) {
  const market =
    scorecard.market.fullName ??
    `${scorecard.market.name}, ${scorecard.market.state}`;
  return (
    <View
      fixed
      style={{ position: "absolute", top: 20, left: 48, right: 48 }}
      render={({ pageNumber }) =>
        pageNumber === 1 ? null : (
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 5,
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: COLOR_GRID,
            }}
          >
            <View
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Text style={{ fontSize: 9.5, color: C.ink, fontFamily: "Helvetica-Bold" }}>
                {scorecard.pm.name}
              </Text>
              <Text style={{ fontSize: 8, color: C.faint }}>·</Text>
              <Text style={{ fontSize: 8, color: C.label }}>{market}</Text>
            </View>
            <Text
              style={{
                fontSize: 7.5,
                color: C.label,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                fontFamily: "Helvetica-Bold",
              }}
            >
              Property Manager Scorecard
            </Text>
          </View>
        )
      }
    />
  );
}

// =====================================================================
//  05 Methodology & limits (from the raw scorecard) — mirrors MethodologyFooter
// =====================================================================

function MethodologyCoverageTable({ scorecard }: { scorecard: ScorecardData }) {
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
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Value</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{r.label}</Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MethodologyPortfolioTable({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Observed managed units · this MSA", value: fmtInt(c.totalObservedUnits) },
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
      label: "Share in concentrated communities (10+ units)",
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
        <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Value</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{r.label}</Text>
          <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MethodologySampleSizeTable({ scorecard }: { scorecard: ScorecardData }) {
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
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={styles.perfEyebrowMuted}>Sample sizes per metric</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2, paddingRight: 8 }]}>Metric</Text>
        <Text style={[styles.tableHeaderCell, { width: 44, textAlign: "right", paddingRight: 16 }]}>N</Text>
        <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Backing</Text>
      </View>
      {rows.map((r) => (
        <View key={r.metric} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2, paddingRight: 8 }]}>{r.metric}</Text>
          <Text style={[styles.tableCell, { width: 44, textAlign: "right", paddingRight: 16 }]}>{r.n}</Text>
          <Text style={[styles.tableCellMuted, { flex: 3 }]}>{r.note}</Text>
        </View>
      ))}
    </View>
  );
}

function MethodologySection({
  scorecard,
  num = "05",
}: {
  scorecard: ScorecardData;
  /** 05 normally; 06 when the Properties section (05) precedes it. */
  num?: string;
}) {
  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <SectionHeader num={num} title="Methodology & limits" />
        <Text style={[styles.paragraph, { marginTop: 4 }]}>
          {`What backs this scorecard — classification rationale, coverage universe, per-metric sample sizes, and the version stamp. Rendered against methodology ${scorecard.methodologyVersion}`}
          {scorecard.designVersion ? `, design ${scorecard.designVersion}` : ""}
          {`. Underlying data is current as of ${fmtDate(scorecard.dataAsOf)}.`}
        </Text>
      </View>

      {scorecard.classificationRationale ? (
        <View wrap={false} minPresenceAhead={40}>
          <Text style={styles.sectionHeader}>Classification rationale</Text>
          <Text style={styles.paragraph}>{scorecard.classificationRationale}</Text>
        </View>
      ) : null}

      {/* Keep the "Coverage universe" heading with its two tables so the
          sub-heading never strands at the bottom of a page. */}
      <View wrap={false} minPresenceAhead={40}>
        <Text style={styles.sectionHeader}>Coverage universe</Text>
        <View style={{ display: "flex", flexDirection: "row", gap: 24, marginTop: 2 }}>
          <MethodologyCoverageTable scorecard={scorecard} />
          <MethodologyPortfolioTable scorecard={scorecard} />
        </View>
      </View>

      <MethodologySampleSizeTable scorecard={scorecard} />

      <View wrap={false} minPresenceAhead={40}>
        <Text style={styles.sectionHeader}>Disclaimer</Text>
        <Text style={styles.paragraph}>
          Operator IQ scorecards reflect operator behavior observable in our first-party
          listings data. Figures are not portfolio totals; they&rsquo;re what we see.
          Operators with shorter observation history have noisier estimates on metrics
          built from observed tenancy episodes (Tenant Retention, a Kaplan-Meier survival
          estimate) or multi-year trajectory (Rent Performance). See the methodology page
          for full caveats.
        </Text>
      </View>

      <View wrap={false} minPresenceAhead={20}>
        <Text style={styles.sectionHeader}>Suggested citation</Text>
        <Text style={styles.paragraph}>
          {`Dwellsy IQ, 2026. Operator IQ Scorecard for ${scorecard.pm.name} (${scorecard.market.name}). Methodology ${scorecard.methodologyVersion}`}
          {scorecard.designVersion ? ` · Design ${scorecard.designVersion}` : ""}
          {`. iq.dwellsy.com/property-managers/${scorecard.pm.slug}`}
        </Text>

        <View style={{ marginTop: 8 }}>
          <Link
            src="https://iq.dwellsy.com/methodology"
            style={{ fontSize: 10, color: COLOR_TEAL, fontFamily: "Helvetica-Bold" }}
          >
            Full methodology » iq.dwellsy.com/methodology
          </Link>
        </View>
      </View>
    </View>
  );
}

// =====================================================================
//  Shared style fragments
// =====================================================================

const cardBox = {
  borderWidth: 1,
  borderStyle: "solid" as const,
  borderColor: C.softBorder,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginBottom: 10,
};

const metricCardBox = {
  borderWidth: 1,
  borderStyle: "solid" as const,
  borderColor: C.cardBorder,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 10,
};

const swChipBox = {
  borderWidth: 1,
  borderStyle: "solid" as const,
  borderColor: "#e0e5ee",
  borderRadius: 20,
  paddingHorizontal: 8,
  paddingVertical: 3,
};

const peerHeadCell = {
  fontSize: 7.5,
  color: C.label,
  textTransform: "uppercase" as const,
  letterSpacing: 0.3,
  fontFamily: "Helvetica-Bold",
};

const peerCell = {
  fontSize: 9,
  color: "#374356",
  paddingHorizontal: 4,
};

// =====================================================================
//  Document
// =====================================================================

export function OperatorProfilePDF({
  view,
  scorecard,
  coverageMap,
}: {
  /** Pre-built view model — the single source both web + PDF read from. */
  view: ScorecardView;
  /** Raw scorecard — needed by the methodology footer only (mirrors what
   *  ScorecardBody passes MethodologyFooter). */
  scorecard: ScorecardData;
  coverageMap: CoverageMapImage | null;
}) {
  const logoDataUrl = getLogoDataUrl();
  // Properties section (05) only exists once the pipeline has populated
  // propertyDetail; when present it shifts Methodology to 06 (mirrors
  // ScorecardBody's nav/number gating on the web).
  const hasProperties = !!scorecard.propertyDetail?.properties?.length;

  return (
    <Document
      title={`${view.header.name} — Scorecard`}
      author="Dwellsy IQ"
      subject={`Property manager scorecard for ${view.header.name}`}
      creator="Dwellsy IQ"
    >
      {/*
        Single continuous page. Content flows across as many physical LETTER
        pages as it needs and fills each one; @react-pdf paginates
        automatically. Atomic (`wrap={false}`) cards keep individual blocks
        from splitting across a page boundary, and each section's heading +
        takeaway are kept together (`minPresenceAhead`) so a heading never
        strands at the bottom of a page. The masthead below is page-1 only;
        the fixed RunningHeader supplies the compact header on pages 2+, and
        the fixed PageFooter repeats on every page.
      */}
      <Page size="LETTER" style={styles.page} wrap>
        <RunningHeader scorecard={scorecard} />

        <ScorecardHeaderBlock header={view.header} logoDataUrl={logoDataUrl} />
        <ExecReadout readout={view.readout} maturityNote={view.maturityNote} />

        <View style={{ marginTop: 12 }}>
          <ScaleFitSection
            scaleFit={view.scaleFit}
            peers={view.peers}
            coverageMap={coverageMap}
            geo={scorecard.geographicCoverage}
          />
        </View>
        {/* Force "02 Operating Performance" onto a fresh page. Section 01 now
            carries the full-width coverage map, so it reliably spans past the
            first page; without this break, section 02 lands low on the map's
            page and react-pdf can't cleanly break its wrap={false} metric
            cards, overlapping them. Starting 02 fresh guarantees a full page
            of room regardless of the operator's section-01 height (peers,
            cross-market block, unit mix, rent-tier lines all vary). */}
        <View style={{ marginTop: 20 }} break>
          <OperatingSection operating={view.operating} />
        </View>
        <View style={{ marginTop: 20 }}>
          <MomentumSection momentum={view.momentum} />
        </View>
        <View style={{ marginTop: 20 }}>
          <WatchItemsSection items={view.watchItems} />
        </View>
        {hasProperties ? (
          <View style={{ marginTop: 20 }}>
            <PropertiesSection scorecard={scorecard} num="05" />
          </View>
        ) : null}
        <View style={{ marginTop: 20 }}>
          <MethodologySection scorecard={scorecard} num={hasProperties ? "06" : "05"} />
        </View>

        <PageFooter scorecard={scorecard} />
      </Page>
    </Document>
  );
}
