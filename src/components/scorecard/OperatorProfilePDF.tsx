// Operator profile PDF — Dwellsy IQ scorecard (design v3, violet print system).
//
// Deterministic, server-rendered deal-room artifact built with
// @react-pdf/renderer (no headless browser). It consumes the SAME
// ScorecardView the live web scorecard renders (buildScorecardView →
// ScorecardView), so web + PDF can never drift on DATA. The PRESENTATION,
// however, intentionally diverges: this is the violet print system from the
// Claude-Design handoff (docs/design/pdf-scorecard-v3/README.md), while the web
// scorecard keeps its navy/teal system.
//
// Page map (target starts; the single wrapping <Page> auto-paginates, and
// sections flow onto extra pages when an operator's data runs long — this is
// NOT a rigid 6-fixed-page layout):
//   1  Cover — dark prismatic hero + 30-second readout + at-a-glance tiles
//   2  01 Scale & fit
//   3  Similar local players + 02 Operating performance
//   4  03 Momentum + 04 Watch items
//   5  05 Properties
//   6  06 Methodology & limits
//
// Rank + composite score are never surfaced (hard rule). All numbers/labels
// come from the view model; nothing is recomputed here.
//
// @react-pdf constraints honored: flexbox only (no CSS grid); the prismatic
// hero gradient is approximated with SVG radial gradients over a dark base; no
// emoji; sparklines + medal dots + quartile markers are native primitives.

import type { ReactNode } from "react";
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
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
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
import { managementModelLabel } from "@/lib/management-model/resolve";
import { sizeBandLabel, SIZE_COVERAGE_CAVEAT_SHORT } from "@/lib/operator-size-bands";
import {
  coverageMapRenderModel,
  coverageRadius,
  MAP_W,
  MAP_H,
} from "@/lib/scorecard/coverage-map-geo";
import {
  projectPropertyRows,
  type ComparableCell,
  type PropertyRowVM,
} from "@/lib/scorecard/property-detail-view";

import {
  styles,
  FONT,
  NIGHT_BASE,
  NIGHT_LIGHT,
  INK,
  BODY,
  MUTED,
  FAINT,
  BORDER,
  BAND,
  TILE,
  CHIP,
  VIOLET,
  VIOLET_SOFT,
  ROW_HL,
  TEAL,
  TEAL_CHIP_BG,
  TEAL_CHIP_FG,
  MAGENTA_CHIP_BG,
  MAGENTA_CHIP_FG,
  YELLOW,
  YELLOW_RING,
  SILVER,
  SILVER_RING,
  POS,
  NEG,
} from "./OperatorProfilePDF.theme";

// --- Font registration (once per lambda) ---
// Inter, bundled under public/fonts (loaded the same proven way the wordmark
// PNG is). Weights selected by `fontWeight`. Wrapped so a missing file logs
// rather than throwing at module load; the route's 500 handler + Sentry catch
// any render-time consequence.
try {
  const fontDir = join(process.cwd(), "public", "fonts");
  Font.register({
    family: FONT,
    fonts: [
      { src: join(fontDir, "inter-400.woff"), fontWeight: 400 },
      { src: join(fontDir, "inter-500.woff"), fontWeight: 500 },
      { src: join(fontDir, "inter-600.woff"), fontWeight: 600 },
      { src: join(fontDir, "inter-700.woff"), fontWeight: 700 },
      { src: join(fontDir, "inter-800.woff"), fontWeight: 800 },
      { src: join(fontDir, "inter-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
} catch (err) {
  console.error("[scorecard-pdf] Inter font registration failed", err);
}
// Disable automatic mid-word hyphenation. @react-pdf otherwise breaks long
// words with a hyphen to fit narrow columns; returning the whole word forces
// clean whole-word wrapping instead.
Font.registerHyphenationCallback((word) => [word]);

// =====================================================================
//  Format helpers
// =====================================================================
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
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// =====================================================================
//  Rating chip — the one shared chip primitive (README "Rating chips")
// =====================================================================
type ChipStyle = { bg: string; fg: string };
function chipStyleFor(label: string): ChipStyle {
  switch (label.toLowerCase().trim()) {
    case "strong":
      return { bg: VIOLET, fg: "#ffffff" };
    case "good":
    case "positive":
    case "in line":
      return { bg: TEAL_CHIP_BG, fg: TEAL_CHIP_FG };
    case "growing":
    case "declining":
    case "shrinking":
    case "watch":
    case "risk":
      return { bg: MAGENTA_CHIP_BG, fg: MAGENTA_CHIP_FG };
    case "neutral":
    case "stable":
    case "mixed":
    case "volatile":
    case "insufficient":
    default:
      return { bg: CHIP, fg: MUTED };
  }
}

/** Uppercase rating chip. `text` overrides the label's displayed string
 *  (e.g. "0 to review") while `tone` drives the color. */
function RatingChip({
  label,
  text,
  tone,
}: {
  label?: ScoreLabel | string;
  text?: string;
  tone?: string;
}) {
  const key = (tone ?? label ?? "neutral").toString();
  const { bg, fg } = chipStyleFor(key);
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingVertical: 3,
        paddingHorizontal: 10,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {text ?? label}
      </Text>
    </View>
  );
}

/** Small letterspaced micro-label (30-SECOND READOUT, tile labels, sub-heads). */
function MicroLabel({ children, style }: { children: string; style?: Style }) {
  return <Text style={style ? [styles.microLabel, style] : styles.microLabel}>{children}</Text>;
}

// =====================================================================
//  Section header — violet number + h2 + optional chip + intro sentence
// =====================================================================
function SectionHeader({
  num,
  title,
  chip,
  chipNode,
  intro,
}: {
  num: string;
  title: string;
  chip?: ScoreLabel | string;
  chipNode?: React.ReactNode;
  intro?: string;
}) {
  return (
    <View>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={styles.sectionNum}>{num}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {chipNode != null ? chipNode : chip != null ? <RatingChip label={chip} /> : null}
      </View>
      {intro ? <Text style={styles.sectionIntro}>{intro}</Text> : null}
    </View>
  );
}

// =====================================================================
//  Medal dots (gold/silver circles + "n gold · n silver")
// =====================================================================
function MedalDots({
  goldCount,
  silverCount,
  onDark = false,
}: {
  goldCount: number;
  silverCount: number;
  onDark?: boolean;
}) {
  const dots: string[] = [
    ...Array(goldCount).fill(YELLOW),
    ...Array(silverCount).fill(SILVER),
  ];
  const textColor = onDark ? "rgba(255,255,255,0.85)" : MUTED;
  return (
    <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
      {dots.length > 0 ? (
        <View style={{ display: "flex", flexDirection: "row", gap: 3 }}>
          {dots.map((c, i) => (
            <View
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: c,
                borderWidth: 1.5,
                borderStyle: "solid",
                borderColor: c === YELLOW ? YELLOW_RING : SILVER_RING,
              }}
            />
          ))}
        </View>
      ) : null}
      <Text style={{ fontSize: 11, fontWeight: 600, color: textColor }}>
        {goldCount} gold · {silverCount} silver
      </Text>
    </View>
  );
}

// =====================================================================
//  Page 1 — Cover (dark prismatic hero)
// =====================================================================
const HERO_W = 612; // LETTER width in pt (full-bleed)
const HERO_H = 336;
// Coverage map now runs full-width below the three §01 stat cards, so it can
// be large (≈2:1 over the full content column) while still sharing page 2.
const MAP_CARD_H = 178;

/** Hero pill chip. `variant`: "solid" (translucent white) or "confidence"
 *  (yellow-tinted). Rendered on the dark hero. */
function HeroPill({
  children,
  confidence = false,
}: {
  children: ReactNode;
  confidence?: boolean;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 11,
        borderWidth: 1,
        borderStyle: "solid",
        backgroundColor: confidence ? "rgba(255,200,32,0.14)" : "rgba(255,255,255,0.08)",
        borderColor: confidence ? "rgba(255,200,32,0.45)" : "rgba(255,255,255,0.22)",
      }}
    >
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: confidence ? YELLOW : "rgba(255,255,255,0.92)",
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function CoverHero({ header }: { header: ScorecardView["header"] }) {
  const mm = header.managementModel;
  const confidenceText =
    mm?.confidence != null
      ? `${mm.confidence.charAt(0).toUpperCase()}${mm.confidence.slice(1)} confidence`
      : null;
  const rationale = mm?.basis ?? null;
  const msaLine = header.singleMarket
    ? `${header.marketFullName} · single-market`
    : header.marketFullName;
  // Shrink the display name for long / multi-word operator names so a wrapped
  // two-line name doesn't collide with the pill chips below it.
  const nameLen = header.name.length;
  const nameSize = nameLen > 26 ? 34 : nameLen > 18 ? 40 : 46;

  return (
    <View
      style={{
        position: "relative",
        minHeight: HERO_H,
        marginTop: -74,
        marginLeft: -56,
        marginRight: -56,
        marginBottom: 26,
        backgroundColor: NIGHT_BASE,
        overflow: "hidden",
      }}
    >
      {/* Prismatic backdrop — dark linear base + three soft radial glows.
          Stretched to fill via 100% width/height so it always covers the hero,
          even when a long name grows the box past its min-height. */}
      <Svg
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        viewBox={`0 0 ${HERO_W} ${HERO_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="heroBase" x1="0" y1="0" x2={HERO_W} y2={HERO_H} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={NIGHT_LIGHT} />
            <Stop offset="0.55" stopColor={NIGHT_BASE} />
            <Stop offset="1" stopColor={NIGHT_BASE} />
          </LinearGradient>
          <RadialGradient id="glowViolet" cx={500} cy={30} r={420} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={VIOLET} stopOpacity={0.55} />
            <Stop offset="1" stopColor={VIOLET} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowTeal" cx={600} cy={185} r={320} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={TEAL} stopOpacity={0.32} />
            <Stop offset="1" stopColor={TEAL} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowMagenta" cx={40} cy={330} r={360} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#b3267f" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#b3267f" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={HERO_W} height={HERO_H} fill="url(#heroBase)" />
        <Rect x={0} y={0} width={HERO_W} height={HERO_H} fill="url(#glowViolet)" />
        <Rect x={0} y={0} width={HERO_W} height={HERO_H} fill="url(#glowTeal)" />
        <Rect x={0} y={0} width={HERO_W} height={HERO_H} fill="url(#glowMagenta)" />
      </Svg>

      {/* Hero content */}
      <View
        style={{
          position: "relative",
          minHeight: HERO_H,
          paddingTop: 40,
          paddingBottom: 34,
          paddingHorizontal: 56,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Wordmark row */}
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>
            <Text style={{ color: "#ffffff" }}>Dwellsy</Text>
            <Text style={{ color: YELLOW }}>IQ</Text>
          </Text>
          <View style={{ display: "flex", flexDirection: "row", gap: 10 }}>
            {header.dwellsyCompanyUrl != null ? (
              <Link
                src={header.dwellsyCompanyUrl}
                style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)", textDecoration: "none" }}
              >
                View listings on Dwellsy »
              </Link>
            ) : null}
            {header.website != null ? (
              <Link
                src={header.website}
                style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
              >
                Operator website »
              </Link>
            ) : null}
          </View>
        </View>

        {/* Eyebrow + name — pushed down from the wordmark */}
        <View style={{ marginTop: 38 }}>
          <Text style={{ fontSize: 13, fontWeight: 600, color: TEAL }}>
            Property Manager Scorecard
          </Text>
          <Text
            style={{
              fontSize: nameSize,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: -1,
              lineHeight: 1.05,
              marginTop: 8,
            }}
          >
            {header.name}
          </Text>
        </View>

        {/* Pill chips */}
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14,
          }}
        >
          {header.quadrant7Cell != null ? <HeroPill>{header.quadrant7Cell}</HeroPill> : null}
          {mm != null ? <HeroPill>{managementModelLabel(mm.model)}</HeroPill> : null}
          {confidenceText != null ? <HeroPill confidence>{confidenceText}</HeroPill> : null}
        </View>

        {/* Rationale */}
        {rationale != null ? (
          <Text
            style={{
              fontSize: 12,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.72)",
              marginTop: 12,
              lineHeight: 1.4,
              maxWidth: 440,
            }}
          >
            {rationale}
          </Text>
        ) : null}

        {/* Spacer pushes the bottom row to the hero's base */}
        <View style={{ flex: 1 }} />

        {/* Bottom row: MSA (left) · medals (right), above a hairline */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: "rgba(255,255,255,0.12)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {msaLine}
          </Text>
          <MedalDots goldCount={header.goldCount} silverCount={header.silverCount} onDark />
        </View>
      </View>
    </View>
  );
}

// =====================================================================
//  30-second readout
// =====================================================================
function ExecReadout({
  readout,
  maturityNote,
}: {
  readout: ScorecardView["readout"];
  maturityNote: string | null;
}) {
  return (
    <View style={{ marginBottom: 22 }}>
      <MicroLabel style={{ marginBottom: 8 }}>30-second readout</MicroLabel>
      <View>
        {readout.map((row, i) => (
          <View
            key={row.area}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopStyle: "solid",
              borderTopColor: BORDER,
            }}
          >
            <Text style={{ width: 170, fontSize: 12, fontWeight: 700, color: INK }}>
              {row.area}
            </Text>
            <Text style={{ flex: 1, fontSize: 11.5, color: BODY, lineHeight: 1.35 }}>
              {row.value || "—"}
            </Text>
            {row.label != null ? <RatingChip label={row.label} /> : null}
          </View>
        ))}
      </View>
      {maturityNote != null ? (
        <Text style={{ fontSize: 9.5, color: FAINT, marginTop: 8 }}>{maturityNote}</Text>
      ) : null}
    </View>
  );
}

// =====================================================================
//  At a glance — 5 equal grey tiles
// =====================================================================
type GlanceTile = { label: string; value: string; big: boolean };

function AtAGlance({ tiles }: { tiles: GlanceTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <View>
      <MicroLabel style={{ marginBottom: 8 }}>At a glance</MicroLabel>
      <View style={{ display: "flex", flexDirection: "row", gap: 8 }}>
        {tiles.map((t) => (
          <View
            key={t.label}
            style={{
              flex: 1,
              backgroundColor: TILE,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 12,
            }}
          >
            {/* Fixed two-line label box so a wrapping label ("Observed units")
                doesn't push its value down — every tile's number starts at the
                same baseline. */}
            <View style={{ height: 24 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1.25 }}>
                {t.label}
              </Text>
            </View>
            <Text
              style={{
                fontSize: t.big ? 22 : 14,
                fontWeight: 800,
                color: INK,
                marginTop: 4,
                letterSpacing: -0.3,
              }}
            >
              {t.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function buildGlanceTiles(scaleFit: ScaleFitView): GlanceTile[] {
  const tiles: GlanceTile[] = [];
  // No size estimate up here. At-a-glance tiles are the numbers a reader takes
  // at face value, so they hold hard counts only — the banded estimate lives in
  // the Portfolio size card below, next to the caveat that qualifies it.
  if (scaleFit.observedUnits != null) {
    tiles.push({ label: "Observed units", value: fmtInt(scaleFit.observedUnits), big: true });
  }
  if (scaleFit.citiesObserved != null) {
    tiles.push({ label: "Cities", value: String(scaleFit.citiesObserved), big: true });
  }
  if (scaleFit.communitiesObserved != null) {
    tiles.push({ label: "Communities", value: String(scaleFit.communitiesObserved), big: true });
  }
  if (scaleFit.tenure != null) {
    tiles.push({
      label: "Tenure",
      value: `${scaleFit.tenure.yearsVisible.toFixed(1)}y`,
      big: true,
    });
  }
  if (scaleFit.propertyType != null) {
    tiles.push({ label: "Type", value: scaleFit.propertyType, big: false });
  }
  return tiles.slice(0, 5);
}

/** Cross-market footprint (multi-market operators only). Lives on page 1 with
 *  the identity/scale summary — it's a "how big / where else" fact, and keeping
 *  it off §01 means the full-width coverage map stays on page 2 for multi-market
 *  operators too (rather than being pushed to its own page). */
function CrossMarketFootprint({
  crossMarket,
}: {
  crossMarket: NonNullable<ScaleFitView["crossMarket"]>;
}) {
  const names = crossMarket.marketNames;
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  // Single self-contained line: page 1 only has ~50pt free below the tiles, so
  // this must not wrap to a second line (which would split across the page
  // boundary). maxLines + ellipsis is the hard backstop; wrap={false} keeps the
  // label + line together on page 1.
  return (
    <View style={{ marginTop: 16 }} wrap={false}>
      <MicroLabel style={{ marginBottom: 6 }}>Also operates in</MicroLabel>
      <Text
        style={{ fontSize: 11, fontWeight: 700, color: VIOLET, maxLines: 1, textOverflow: "ellipsis" }}
      >
        {shown.join(" · ")}
        {extra > 0 ? ` +${extra} more` : ""}
      </Text>
    </View>
  );
}

// =====================================================================
//  01 Scale & fit
// =====================================================================

/** Portfolio scale bar: three inline stats + a track with a solid violet
 *  segment (0→observed), a violet-soft plausible-range band, and a near-black
 *  best-estimate point dot with a white ring. */
function PortfolioScaleBar({
  estimate,
  observedUnits,
}: {
  estimate: ScaleFitView["estimate"];
  observedUnits: number | null;
}) {
  const { point, low, high, status, message } = estimate;
  const hasBand = low != null && high != null;

  if (point == null && !hasBand && observedUnits == null) {
    const friendly =
      message ??
      (status === "insufficient_data"
        ? "Not enough observed data to estimate portfolio size yet."
        : status);
    return (
      <View style={styles.card} wrap={false}>
        <MicroLabel>Portfolio size</MicroLabel>
        <Text style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>{friendly}</Text>
      </View>
    );
  }

  const upperRaw = Math.max(point ?? 0, high ?? 0, observedUnits ?? 0, 1) * 1.15;
  // Round the axis max up to a clean number for the ticks.
  const mag = Math.pow(10, Math.floor(Math.log10(upperRaw)));
  const axisMax = Math.ceil(upperRaw / mag) * mag;
  const toPct = (v: number) => Math.min(100, Math.max(0, (v / axisMax) * 100));
  const obsPct = observedUnits != null ? toPct(observedUnits) : null;
  const bandLeft = hasBand ? toPct(low!) : null;
  const bandWidth = hasBand ? toPct(high!) - toPct(low!) : null;
  const pointPct = point != null ? toPct(point) : null;

  return (
    <View style={styles.card} wrap={false}>
      <MicroLabel>Portfolio size</MicroLabel>
      {/* Inline stats */}
      <View style={{ display: "flex", flexDirection: "row", gap: 28, marginTop: 8, marginBottom: 10, alignItems: "baseline" }}>
        {observedUnits != null ? (
          <View>
            <Text style={{ fontSize: 26, fontWeight: 800, color: VIOLET, letterSpacing: -0.5 }}>
              {fmtInt(observedUnits)}
            </Text>
            <Text style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>observed units (T12)</Text>
          </View>
        ) : null}
        {/* The estimate reads as a band, not a figure. This page ends up in a
            deal room in front of someone who knows their own unit count, and a
            26pt "790" next to an operator running 1,400 is the one number that
            can lose the room. The point still drives the marker on the track
            below; it just no longer makes a precision claim in type. */}
        {sizeBandLabel(point) != null ? (
          <View>
            <Text style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: -0.4 }}>
              {sizeBandLabel(point)}
            </Text>
            <Text style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>estimated units managed</Text>
          </View>
        ) : null}
      </View>
      {/* Track */}
      <View style={{ position: "relative", height: 14, borderRadius: 7, backgroundColor: TILE }}>
        {hasBand ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${bandLeft}%`,
              width: `${bandWidth}%`,
              backgroundColor: VIOLET_SOFT,
              borderRadius: 7,
            }}
          />
        ) : null}
        {obsPct != null ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: `${obsPct}%`,
              backgroundColor: VIOLET,
              borderRadius: 7,
            }}
          />
        ) : null}
        {pointPct != null ? (
          <View
            style={{
              position: "absolute",
              top: -2,
              left: `${pointPct}%`,
              marginLeft: -6,
              width: 12,
              height: 18,
              borderRadius: 6,
              backgroundColor: INK,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: "#ffffff",
            }}
          />
        ) : null}
      </View>
      {/* Axis ticks */}
      <View style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 9, color: FAINT }}>0</Text>
        <Text style={{ fontSize: 9, color: FAINT }}>{fmtInt(axisMax)}</Text>
      </View>
      {/* Legend and coverage limit share one paragraph. The caveat has to
          travel with the PDF — it leaves with the reader and gets forwarded —
          but as its own block it cost two extra lines, which was enough to push
          the coverage map off this page and onto a near-empty one of its own.
          Folded in here it costs a single wrapped line. */}
      <Text style={{ fontSize: 9, color: MUTED, marginTop: 6, lineHeight: 1.35 }}>
        {hasBand
          ? "Violet = observed units (T12) · band = turnover uncertainty · dot = point estimate. "
          : "Violet = observed units (T12) · dot = point estimate. "}
        <Text style={{ color: FAINT }}>{SIZE_COVERAGE_CAVEAT_SHORT}</Text>
      </Text>
    </View>
  );
}

/** Stacked top-cities concentration bar (top city violet, second teal,
 *  remainder band-grey) + legend rows + cohort-comparison caption. */
function ConcentrationCard({
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
      <View style={[styles.card, { flex: 1 }]} wrap={false}>
        <MicroLabel style={{ marginBottom: 8 }}>Geographic concentration</MicroLabel>
        <Text style={{ fontSize: 10, color: MUTED }}>Geographic breakdown not available.</Text>
      </View>
    );
  }
  const segColors = [VIOLET, TEAL, BAND];
  const named = topCities.slice(0, 2);
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

  const legend: Array<{ name: string; pct: number; color: string }> = [
    ...named.map((c, i) => ({ name: c.name, pct: c.pct, color: segColors[i] })),
  ];
  if (otherPct > 1) legend.push({ name: "Other cities", pct: otherPct, color: BAND });

  return (
    <View style={[styles.card, { flex: 1 }]} wrap={false}>
      <MicroLabel style={{ marginBottom: 8 }}>Geographic concentration</MicroLabel>
      <View style={{ display: "flex", flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden" }}>
        {named.map((c, i) => (
          <View key={c.name} style={{ width: `${c.pct}%`, backgroundColor: segColors[i] }} />
        ))}
        {otherPct > 0 ? <View style={{ width: `${otherPct}%`, backgroundColor: BAND }} /> : null}
      </View>
      <View style={{ marginTop: 10 }}>
        {legend.map((l) => (
          <View key={l.name} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            <Text style={{ flex: 1, fontSize: 9.5, color: BODY }}>{l.name}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 700, color: INK }}>{Math.round(l.pct)}%</Text>
          </View>
        ))}
      </View>
      {caption != null ? (
        <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 6, lineHeight: 1.4 }}>{caption}</Text>
      ) : null}
    </View>
  );
}

/** Coverage map — Mapbox basemap (fetched server-side) with violet coverage
 *  dots drawn locally, or an SVG-only fallback. Dots are recolored violet per
 *  design v3 (was teal). */
function CoverageMapCard({
  coverageMap,
  geo,
}: {
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
  const model = coverageMapRenderModel(coverageMap, geo);
  if (model.mode === "empty") {
    return null;
  }
  return (
    <View style={styles.card} wrap={false}>
      <MicroLabel style={{ marginBottom: 8 }}>Coverage</MicroLabel>
      <View
        style={{
          position: "relative",
          width: "100%",
          height: MAP_CARD_H,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: BORDER,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {model.mode === "basemap" ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image
            src={model.imageSrc}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: MAP_CARD_H }}
          />
        ) : null}
        <Svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: MAP_CARD_H }}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
        >
          {model.mode === "fallback" ? <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill={TILE} /> : null}
          {model.backdrop.map((p, i) => (
            <Circle key={`b${i}`} cx={p.x} cy={p.y} r={1.8} fill="#B8C2D1" opacity={0.28} />
          ))}
          {model.coverage.map((p, i) => (
            <Circle
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={coverageRadius(p.n)}
              fill={VIOLET}
              fillOpacity={0.22}
              stroke={VIOLET}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      </View>
      <Text style={{ fontSize: 9, color: FAINT, marginTop: 6 }}>
        {model.mode === "basemap"
          ? "Basemap © Mapbox © OpenStreetMap · dot area ∝ managed homes"
          : "Coverage footprint · dot area ∝ managed homes"}
      </Text>
    </View>
  );
}

/** Rent tier: median headline + a track with a grey band (market P25–P75) and
 *  a violet operator-median marker dot. */
function RentTierCard({ detail }: { detail: RentTierDetail | null }) {
  if (detail == null) {
    return (
      <View style={[styles.card, { flex: 1 }]} wrap={false}>
        <MicroLabel style={{ marginBottom: 8 }}>Rent tier</MicroLabel>
        <Text style={{ fontSize: 10, color: FAINT }}>Rent tier data not yet available.</Text>
      </View>
    );
  }
  const pos = clamp01(detail.position) * 100;
  const tierWord = pos < 33 ? "value" : pos < 67 ? "mid-market" : "premium";
  const bandLine =
    detail.marketP25 != null && detail.marketP75 != null
      ? `Market P25 $${fmtInt(detail.marketP25)} — P75 $${fmtInt(detail.marketP75)}`
      : null;

  return (
    <View style={[styles.card, { flex: 1 }]} wrap={false}>
      <MicroLabel style={{ marginBottom: 8 }}>Rent tier</MicroLabel>
      <Text style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: -0.4 }}>
        ~${fmtInt(detail.rentMedian)}/mo
      </Text>
      <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
        {`median rent · ${tierWord} end${detail.sampleSize != null ? ` · ${detail.sampleSize} listing${detail.sampleSize === 1 ? "" : "s"}` : ""}`}
      </Text>
      {/* Track: grey band = market IQR, violet dot = operator median */}
      <View style={{ position: "relative", height: 8, marginTop: 16, borderRadius: 4, backgroundColor: TILE }}>
        <View style={{ position: "absolute", left: "22%", width: "56%", top: 0, bottom: 0, backgroundColor: BAND, borderRadius: 4 }} />
        <View
          style={{
            position: "absolute",
            top: -3,
            left: `${pos}%`,
            marginLeft: -7,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: VIOLET,
            borderWidth: 2.5,
            borderStyle: "solid",
            borderColor: "#ffffff",
          }}
        />
      </View>
      {bandLine != null ? (
        <Text style={{ fontSize: 9, color: FAINT, marginTop: 8, textAlign: "center" }}>{bandLine}</Text>
      ) : null}
    </View>
  );
}

/** House / apartment split — single stacked bar + labelled percentages. */
function UnitMixCard({ unitMix }: { unitMix: NonNullable<ScaleFitView["unitMix"]> }) {
  const { houseUrus, aptUrus } = unitMix;
  const total = houseUrus + aptUrus;
  if (total <= 0) return <View style={{ flex: 1 }} />;
  const housePct = Math.round((houseUrus / total) * 100);
  const aptPct = 100 - housePct;
  return (
    <View style={[styles.card, { flex: 1 }]} wrap={false}>
      <MicroLabel style={{ marginBottom: 8 }}>House vs apartment split</MicroLabel>
      <View style={{ display: "flex", flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden" }}>
        {houseUrus > 0 ? <View style={{ width: `${housePct}%`, backgroundColor: VIOLET }} /> : null}
        {aptUrus > 0 ? <View style={{ width: `${aptPct}%`, backgroundColor: TEAL }} /> : null}
      </View>
      {/* Stacked blocks (not a wide space-between row) so the labels don't
          collide at ⅓-card width. */}
      <View style={{ display: "flex", flexDirection: "row", marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: 800, color: VIOLET, letterSpacing: -0.4 }}>{housePct}%</Text>
          <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>Houses</Text>
          <Text style={{ fontSize: 8.5, color: FAINT }}>{fmtInt(houseUrus)} units</Text>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 20, fontWeight: 800, color: TEAL_CHIP_FG, letterSpacing: -0.4 }}>{aptPct}%</Text>
          <Text style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>Apartments</Text>
          <Text style={{ fontSize: 8.5, color: FAINT }}>{fmtInt(aptUrus)} units</Text>
        </View>
      </View>
    </View>
  );
}

function ScaleFitSection({
  scaleFit,
  coverageMap,
  geo,
}: {
  scaleFit: ScaleFitView;
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
  return (
    <View>
      <View wrap={false} minPresenceAhead={80}>
        <SectionHeader num="01" title="Scale & fit" intro={scaleFit.takeaway} />
      </View>
      <PortfolioScaleBar estimate={scaleFit.estimate} observedUnits={scaleFit.observedUnits} />
      {/* Three-up: concentration | rent tier | house/apt split — compressed
          onto one line so the coverage map below can run full-width + large. */}
      <View style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "stretch" }} wrap={false}>
        <ConcentrationCard
          topCities={scaleFit.topCities}
          top3Share={scaleFit.top3Share}
          cohortTop3={scaleFit.cohortTop3}
        />
        <RentTierCard detail={scaleFit.rentTier} />
        {scaleFit.unitMix != null ? <UnitMixCard unitMix={scaleFit.unitMix} /> : null}
      </View>
      {/* Full-width coverage map. (The cross-market "Also operates in" footprint
          moved to page 1 with the identity/scale summary — see
          CrossMarketFootprint — so §01 stays on one page and the map no longer
          gets pushed to its own page for multi-market operators.) */}
      <CoverageMapCard coverageMap={coverageMap} geo={geo} />
    </View>
  );
}

// =====================================================================
//  Similar local players (peers table)
// =====================================================================
function PeersTable({ peers }: { peers: SelectedPeer[] }) {
  if (peers.length === 0) return null;
  return (
    <View style={{ marginBottom: 22 }} wrap={false}>
      <MicroLabel style={{ marginBottom: 8 }}>Similar local players</MicroLabel>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Operator</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: "right" }]}>Est. size</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.8, paddingLeft: 10 }]}>Type</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1.6, textAlign: "right" }]}>Operating perf.</Text>
      </View>
      {peers.map((peer) => (
        <View
          key={peer.slug}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 8,
            paddingHorizontal: peer.isFocal ? 6 : 0,
            marginHorizontal: peer.isFocal ? -6 : 0,
            borderRadius: peer.isFocal ? 6 : 0,
            borderBottomWidth: 0.75,
            borderBottomStyle: "solid",
            borderBottomColor: BORDER,
            backgroundColor: peer.isFocal ? ROW_HL : "transparent",
          }}
        >
          <Text style={{ flex: 3, fontSize: 10, color: peer.isFocal ? INK : BODY, fontWeight: peer.isFocal ? 700 : 400 }}>
            {peer.name}
            {peer.isFocal ? <Text style={{ color: VIOLET, fontWeight: 600 }}>  (this operator)</Text> : ""}
          </Text>
          {/* Band, matching the web comparison table — a column of exact peer
              figures invites side-by-side comparisons the estimator can't
              support. Column width is unchanged: "800–1,600" is no wider than
              the four-digit figures it replaces, and widening it squeezed the
              name column enough to hyphenate operator names mid-word. */}
          <Text style={{ flex: 1.3, fontSize: 10, color: BODY, textAlign: "right", fontWeight: peer.isFocal ? 700 : 400 }}>
            {sizeBandLabel(peer.estimatedUnits) ?? "—"}
          </Text>
          <Text style={{ flex: 1.8, fontSize: 10, color: BODY, paddingLeft: 10 }}>{peer.quadrant7Cell ?? "—"}</Text>
          <View style={{ flex: 1.6, alignItems: "flex-end" }}>
            <RatingChip label={peer.operatingLabel} />
          </View>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
//  02 Operating performance — quartile metric cards
// =====================================================================
const TONE_MARKER: Record<MetricTone, string> = {
  good: TEAL,
  watch: MUTED,
  neutral: MUTED,
};

/** Small medal dot for a metric header (gold/silver tier). */
function MetricMedal({ star }: { star: MetricRow["star"] }) {
  if (!star) return null;
  const fill = star === "gold" ? YELLOW : SILVER;
  const ring = star === "gold" ? YELLOW_RING : SILVER_RING;
  return (
    <View
      style={{
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: fill,
        borderWidth: 1.5,
        borderStyle: "solid",
        borderColor: ring,
      }}
    />
  );
}

/** Fallback marker position (0..1) when a true percentile is unknown — placed
 *  qualitatively from the rating label. */
function qualitativePosition(label: string): number | null {
  switch (label.toLowerCase().trim()) {
    case "strong":
      return 0.85;
    case "good":
      return 0.65;
    case "neutral":
    case "in line":
      return 0.5;
    case "watch":
      return 0.25;
    default:
      return null;
  }
}

/**
 * Quartile bar: 8px track; grey band from 25%→75% (cohort P25–P75); median tick
 * at 50%; operator marker dot colored by tone (violet strong / teal good / grey
 * neutral) with a white ring; the value label floats above the marker.
 */
function QuartileBar({
  position,
  value,
  markerColor,
}: {
  position: number | null;
  value: string;
  markerColor: string;
}) {
  const pct = position != null ? clamp01(position) * 100 : null;
  return (
    <View style={{ marginTop: 22 }}>
      {/* Value label floated above the marker */}
      {pct != null ? (
        <View style={{ position: "relative", height: 14 }}>
          <Text
            style={{
              position: "absolute",
              left: `${pct}%`,
              marginLeft: -22,
              width: 44,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 800,
              color: markerColor,
            }}
          >
            {value}
          </Text>
        </View>
      ) : null}
      <View style={{ position: "relative", height: 8 }}>
        {/* Track */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: TILE }} />
        {/* Cohort band 25→75 */}
        <View style={{ position: "absolute", left: "25%", width: "50%", top: 0, bottom: 0, backgroundColor: BAND }} />
        {/* Median tick */}
        <View style={{ position: "absolute", left: "50%", marginLeft: -1, top: -3, height: 14, width: 2, backgroundColor: MUTED }} />
        {/* Operator marker */}
        {pct != null ? (
          <View
            style={{
              position: "absolute",
              top: -3,
              left: `${pct}%`,
              marginLeft: -7,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: markerColor,
              borderWidth: 2.5,
              borderStyle: "solid",
              borderColor: "#ffffff",
            }}
          />
        ) : null}
      </View>
      {/* Tick labels */}
      <View style={{ position: "relative", height: 12, marginTop: 4 }}>
        <Text style={{ position: "absolute", left: "25%", marginLeft: -10, fontSize: 8.5, color: FAINT }}>P25</Text>
        <Text style={{ position: "absolute", left: "50%", marginLeft: -14, fontSize: 8.5, color: FAINT }}>median</Text>
        <Text style={{ position: "absolute", left: "75%", marginLeft: -10, fontSize: 8.5, color: FAINT }}>P75</Text>
      </View>
      {pct == null ? (
        <Text style={{ fontSize: 9, color: FAINT, fontStyle: "italic", marginTop: 2 }}>Position not available.</Text>
      ) : null}
    </View>
  );
}

function markerColorFor(label: string, tone?: MetricTone): string {
  const l = label.toLowerCase().trim();
  if (l === "strong") return VIOLET;
  if (l === "good") return TEAL;
  if (tone) return TONE_MARKER[tone];
  return MUTED;
}

function MetricCard({ metric }: { metric: MetricRow }) {
  const finding = metric.interpretation || metric.benchmark || "";
  const subLine = metric.sub.length > 0 ? metric.sub.join(" · ") : null;
  const position = metric.position ?? qualitativePosition(metric.label);
  const markerColor = markerColorFor(metric.label);
  return (
    <View style={styles.card} wrap={false}>
      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: INK }}>{metric.title}</Text>
        <MetricMedal star={metric.star} />
        <View style={{ flex: 1 }} />
        <RatingChip label={metric.label} />
      </View>
      {finding ? (
        <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.4 }}>
          {finding}
          {subLine ? <Text style={{ color: FAINT }}>{`  ${subLine}`}</Text> : null}
        </Text>
      ) : null}
      <QuartileBar position={position} value={metric.value} markerColor={markerColor} />
    </View>
  );
}

function ConcessionCard({
  concession,
}: {
  concession: NonNullable<OperatingView["concession"]>;
}) {
  const label = concession.tone === "neutral" ? "in line" : concession.tone;
  const markerColor = concession.tone === "watch" ? MUTED : concession.tone === "good" ? TEAL : MUTED;
  // Position the marker by the operator rate relative to a 0..(market×2)-ish scale.
  const scaleMax = Math.max(concession.ratePct, concession.marketRatePct ?? 0) * 1.6 || 1;
  const pos = clamp01(concession.ratePct / scaleMax);
  return (
    <View style={styles.card} wrap={false}>
      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: INK }}>Concessions</Text>
        <View style={{ flex: 1 }} />
        <RatingChip label={label} />
      </View>
      {concession.interpretation ? (
        <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.4 }}>
          {concession.interpretation}
        </Text>
      ) : null}
      <QuartileBar position={pos} value={`${concession.ratePct.toFixed(1)}%`} markerColor={markerColor} />
      <Text style={{ fontSize: 9.5, color: FAINT, marginTop: 10, lineHeight: 1.4 }}>{concession.definition}</Text>
      {concession.patterns.length > 0 ? (
        <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {concession.patterns.map((p) => (
            <View key={p} style={{ backgroundColor: CHIP, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 }}>
              <Text style={{ fontSize: 9, color: MUTED }}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OperatingSection({ operating }: { operating: OperatingView }) {
  const strongIntro =
    operating.strongest.length > 0
      ? `${operating.takeaway} Strongest: ${operating.strongest.join(", ")}.`
      : operating.takeaway;
  return (
    <View>
      <View wrap={false} minPresenceAhead={80}>
        <SectionHeader num="02" title="Operating performance" chip={operating.sectionLabel} intro={strongIntro} />
      </View>
      {operating.metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}
      {operating.concession != null ? <ConcessionCard concession={operating.concession} /> : null}
      <Text style={{ fontSize: 9, color: FAINT, marginTop: 4, lineHeight: 1.4 }}>
        Marker = this operator · grey band = cohort P25–P75 · tick = cohort median. Gold dot = top of cohort.
      </Text>
    </View>
  );
}

// =====================================================================
//  03 Momentum — 2×2 sparkline tiles
// =====================================================================
function sparkStroke(key: string, direction: MomentumDirection): string {
  if (key === "quality") return TEAL;
  return direction === "declining" ? MAGENTA_CHIP_FG : VIOLET;
}

/** Map a numeric series into polyline points in a 260×52 viewBox. */
function sparkPoints(series: number[]): { points: string; last: { x: number; y: number } } {
  const W = 260;
  const H = 52;
  const PAD_Y = 8;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = series.length > 1 ? W / (series.length - 1) : 0;
  let lastX = 0;
  let lastY = H / 2;
  const points = series
    .map((v, i) => {
      const x = i * step;
      const y = H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
      lastX = x;
      lastY = y;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return { points, last: { x: lastX, y: lastY } };
}

function MomentumTile({
  spark,
}: {
  spark: ScorecardView["momentum"]["sparklines"][number];
}) {
  const hasSeries = spark.direction !== "insufficient" && spark.series.length >= 2;
  const stroke = sparkStroke(spark.key, spark.direction);
  const { points, last } = hasSeries ? sparkPoints(spark.series) : { points: "", last: { x: 0, y: 0 } };
  return (
    <View
      style={{
        width: "48%",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: BORDER,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
      wrap={false}
    >
      <Text style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" }}>
        {spark.label}
      </Text>
      <View style={{ marginTop: 8, height: 40 }}>
        {hasSeries ? (
          <Svg width="100%" height={40} viewBox="0 0 260 52" preserveAspectRatio="none">
            <Polyline points={points} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={last.x} cy={last.y} r={4} fill={YELLOW} stroke={YELLOW_RING} strokeWidth={1} />
          </Svg>
        ) : (
          <View style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 9.5, color: FAINT, fontStyle: "italic" }}>building history</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MomentumSection({ momentum }: { momentum: ScorecardView["momentum"] }) {
  const cells = momentum.sparklines.filter((s) => s.key !== "footprint" || s.series.length > 0);
  return (
    <View>
      <View wrap={false} minPresenceAhead={80}>
        <SectionHeader
          num="03"
          title="Momentum"
          chip={momentum.direction === "insufficient" ? undefined : momentum.direction}
          intro={momentum.takeaway}
        />
      </View>
      <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {cells.map((s) => (
          <MomentumTile key={s.key} spark={s} />
        ))}
      </View>
    </View>
  );
}

// =====================================================================
//  04 Watch items — 2-up cards
// =====================================================================
const WATCH_KIND: Record<WatchItemKind, { label: string; tone: string }> = {
  risk: { label: "Risk", tone: "risk" },
  data: { label: "Data limitation", tone: "neutral" },
  context: { label: "Neutral", tone: "neutral" },
  positive: { label: "Positive", tone: "positive" },
};

function WatchCard({ item }: { item: WatchItem }) {
  const cfg = WATCH_KIND[item.kind];
  return (
    <View
      style={{
        width: "48%",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: BORDER,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
      wrap={false}
    >
      <RatingChip text={cfg.label.toUpperCase()} tone={cfg.tone} />
      <Text style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 8 }}>{item.headline}</Text>
      <Text style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>{item.explanation}</Text>
      {item.ask ? (
        <Text style={{ fontSize: 10, color: BODY, marginTop: 6, lineHeight: 1.4 }}>
          <Text style={{ fontWeight: 700, color: INK }}>Ask: </Text>
          {item.ask}
        </Text>
      ) : null}
    </View>
  );
}

function WatchItemsSection({ items }: { items: WatchItem[] }) {
  const reviewCount = items.filter((i) => i.kind !== "positive").length;
  const intro =
    "Signals that need a human read before you hire, monitor, or acquire — some are risks worth a follow-up, some are neutral context, some are positives.";
  return (
    <View>
      <View wrap={false} minPresenceAhead={70}>
        <SectionHeader
          num="04"
          title="Watch items"
          chipNode={
            <RatingChip
              text={`${reviewCount} to review`}
              tone={reviewCount === 0 ? "positive" : "risk"}
            />
          }
          intro={intro}
        />
      </View>
      {items.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: "solid", borderColor: BORDER, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
          <View style={{ marginBottom: 6 }}>
            <RatingChip text="0 TO REVIEW" tone="positive" />
          </View>
          <Text style={{ fontSize: 11, color: BODY, lineHeight: 1.4 }}>
            <Text style={{ fontWeight: 700, color: INK }}>No flags. </Text>
            Clean across the concession, coverage, geography, graded-metric, and trajectory signals we check.
          </Text>
        </View>
      ) : (
        <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {items.map((item, i) => (
            <WatchCard key={`${item.kind}-${i}`} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

// =====================================================================
//  05 Properties
// =====================================================================
const MAX_PDF_PROPERTY_ROWS = 30;

function propDisplayLabel(row: PropertyRowVM): string {
  return row.kind === "sfr-submarket" ? `${row.submarket ?? row.label}` : row.label;
}
function fmtRentValue(n: number): string {
  return `$${fmtInt(n)}`;
}
function fmtDomValue(n: number): string {
  return `${Math.round(n)}d`;
}
function fmtConcessionValue(n: number): string {
  return fmtPct(n * 100, 0);
}
function fmtRentYoyValue(n: number): string {
  return fmtPct(n * 100, 1, true);
}

/** Comparable metric cell: operator value (toned by deltaSign) + "mkt X" comp
 *  beneath. */
function PropComparable({
  cell,
  format,
}: {
  cell: ComparableCell;
  format: (n: number) => string;
}) {
  if (cell.value == null) {
    return <Text style={{ fontSize: 9.5, color: FAINT, textAlign: "right" }}>—</Text>;
  }
  const color = cell.deltaSign === "better" ? POS : cell.deltaSign === "worse" ? NEG : INK;
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ fontSize: 9.5, color, fontWeight: 700 }}>{format(cell.value)}</Text>
      {cell.comp != null ? (
        <Text style={{ fontSize: 7.5, color: FAINT, marginTop: 1 }}>mkt {format(cell.comp)}</Text>
      ) : null}
    </View>
  );
}

/** Quality = score + a 44×5px violet progress bar (width = score%). */
function QualityCell({ score }: { score: number | null }) {
  if (score == null) return <Text style={{ fontSize: 9.5, color: FAINT, textAlign: "right" }}>—</Text>;
  const s = Math.round(score);
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ fontSize: 11, fontWeight: 700, color: INK }}>{s}</Text>
      <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: TILE, marginTop: 3 }}>
        <View style={{ width: `${clamp01(s / 100) * 100}%`, height: 5, borderRadius: 3, backgroundColor: VIOLET }} />
      </View>
    </View>
  );
}

function PropertyRow({ row }: { row: PropertyRowVM }) {
  const sizeText =
    row.kind === "community"
      ? row.units != null
        ? `${fmtInt(row.units)} ${row.units === 1 ? "unit" : "units"}`
        : "—"
      : row.homes != null
        ? `${fmtInt(row.homes)} ${row.homes === 1 ? "home" : "homes"}`
        : "—";
  const isRollup = row.kind === "sfr-submarket";
  return (
    <View style={[styles.tableRow, { alignItems: "flex-start", paddingVertical: 6 }]} wrap={false}>
      <View style={{ flex: 2.6, paddingRight: 6 }}>
        <Text style={{ fontSize: 10.5, fontWeight: 700, color: INK }}>{propDisplayLabel(row)}</Text>
        {isRollup ? <Text style={{ fontSize: 8.5, color: FAINT, marginTop: 1 }}>SFR rollup</Text> : null}
      </View>
      <Text style={{ flex: 1.2, fontSize: 9.5, color: BODY, textAlign: "right", paddingRight: 8 }}>{sizeText}</Text>
      <Text style={{ flex: 0.8, fontSize: 9.5, color: BODY, textAlign: "right", paddingRight: 8 }}>{fmtInt(row.nListings)}</Text>
      <View style={{ flex: 1.3, paddingRight: 8 }}>
        <PropComparable cell={row.medianDomT12} format={fmtDomValue} />
      </View>
      <View style={{ flex: 1.8, paddingRight: 8 }}>
        <PropComparable cell={row.medianRentT12} format={fmtRentValue} />
        <View style={{ height: 1 }} />
        <PropComparable cell={row.rentYoY} format={fmtRentYoyValue} />
      </View>
      <View style={{ flex: 1.3, paddingRight: 8 }}>
        <PropComparable cell={row.concessionRate} format={fmtConcessionValue} />
      </View>
      <View style={{ flex: 1.1 }}>
        <QualityCell score={row.listingQuality} />
      </View>
    </View>
  );
}

function PropertiesSection({ scorecard, num }: { scorecard: ScorecardData; num: string }) {
  const block = scorecard.propertyDetail;
  if (!block?.properties?.length) return null;
  const allRows = projectPropertyRows(block);
  const total = allRows.length;
  const rows = [...allRows].sort((a, b) => b.nListings - a.nListings).slice(0, MAX_PDF_PROPERTY_ROWS);
  const truncated = total > rows.length;

  return (
    <View>
      <View wrap={false} minPresenceAhead={70}>
        <SectionHeader
          num={num}
          title="Properties"
          intro="Per-property observations vs. the MSA median (&ldquo;mkt&rdquo;) — descriptive, not scored. Scattered single-family holdings are grouped into submarket rollups rather than shown per address."
        />
      </View>
      <View wrap={false}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { flex: 2.6 }]}>Property / rollup</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: "right", paddingRight: 8 }]}>Size</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: "right", paddingRight: 8 }]}>Listings</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: "right", paddingRight: 8 }]}>DOM</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.8, textAlign: "right", paddingRight: 8 }]}>Rent · YoY</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: "right", paddingRight: 8 }]}>Concession</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1.1, textAlign: "right" }]}>Quality</Text>
        </View>
        {rows.length > 0 ? <PropertyRow row={rows[0]} /> : null}
      </View>
      {rows.slice(1).map((row, i) => (
        <PropertyRow key={`${row.kind}-${row.label}-${i + 1}`} row={row} />
      ))}
      <Text style={{ fontSize: 9, color: FAINT, marginTop: 8, lineHeight: 1.4 }}>
        Quality = listing completeness + freshness score (0–100). &ldquo;—&rdquo; = insufficient listing history for a YoY read.
      </Text>
      {truncated ? (
        <Text style={{ fontSize: 9, color: FAINT, marginTop: 4, lineHeight: 1.4 }}>
          {`Showing the ${rows.length} highest-volume of ${total} properties. The full list is available in the in-app Properties export.`}
        </Text>
      ) : null}
    </View>
  );
}

// =====================================================================
//  Page chrome — running head (pages 2+) + footer (every page)
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
      <Text render={({ pageNumber, totalPages }) => `intel.iq.dwellsy.com · ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function RunningHeader({ scorecard }: { scorecard: ScorecardData }) {
  const market = scorecard.market.fullName ?? `${scorecard.market.name}, ${scorecard.market.state}`;
  return (
    <View
      fixed
      style={{ position: "absolute", top: 40, left: 56, right: 56 }}
      render={({ pageNumber }) =>
        pageNumber === 1 ? null : (
          <View
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 6,
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: BORDER,
            }}
          >
            <Text
              style={[
                styles.runHeadName,
                { flex: 1, marginRight: 16, maxLines: 1, textOverflow: "ellipsis" },
              ]}
            >
              {scorecard.pm.name} · {market}
            </Text>
            <Text style={styles.runHeadRight}>Property Manager Scorecard</Text>
          </View>
        )
      }
    />
  );
}

// =====================================================================
//  06 Methodology & limits
// =====================================================================
function MethodologyLabelValue({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            paddingVertical: 6,
            borderTopWidth: i === 0 ? 0 : 0.75,
            borderTopStyle: "solid",
            borderTopColor: BORDER,
          }}
        >
          <Text style={{ flex: 1, fontSize: 9.5, color: MUTED }}>{r.label}</Text>
          <Text style={{ fontSize: 9.5, fontWeight: 700, color: INK, textAlign: "right" }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MethodologyCoverageRows(scorecard: ScorecardData): Array<{ label: string; value: string }> {
  const c = scorecard.coverage;
  const rows: Array<{ label: string; value: string }> = [
    { label: "First observed listing", value: fmtDate(c.firstListing) },
    { label: "Months on platform", value: fmtInt(c.monthsOnPlatform) },
    { label: "Listings — lifetime", value: fmtInt(c.lifetimeListings) },
    { label: "Listings — T12", value: fmtInt(c.t12Listings) },
  ];
  if (c.t6Listings !== null) rows.push({ label: "Listings — T6", value: fmtInt(c.t6Listings) });
  rows.push({ label: "URUs — lifetime / T12", value: `${fmtInt(c.urusLifetime)} / ${fmtInt(c.urusT12)}` });
  rows.push({ label: "Active inventory", value: fmtInt(c.activeListings) });
  rows.push({ label: "Data tier", value: c.dataTier });
  return rows;
}

function MethodologyPortfolioRows(scorecard: ScorecardData): Array<{ label: string; value: string }> {
  const c = scorecard.coverage;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Observed managed units · this MSA", value: fmtInt(c.totalObservedUnits) },
  ];
  if (c.nationalObservedUnitsT12 !== null) {
    rows.push({ label: "Observed units · all markets (T12)", value: fmtInt(c.nationalObservedUnitsT12) });
  }
  rows.push({ label: "Cities observed", value: fmtInt(c.citiesObserved) });
  if (c.concentratedShare !== null) {
    rows.push({ label: "Share in concentrated communities (10+ units)", value: fmtPct(c.concentratedShare * 100, 0) });
  }
  if (c.observedCommunityTotalUnits !== undefined) {
    rows.push({ label: "Observed community totals (top-down)", value: fmtInt(c.observedCommunityTotalUnits) });
  }
  rows.push({ label: "7-cell classification", value: scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant ?? "—" });
  return rows;
}

function MethodologySampleSizeTable({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  const t = scorecard.tenancy;
  const rows: Array<{ metric: string; n: string; note: string }> = [
    { metric: "Lease-up Performance (DOM)", n: fmtInt(scorecard.performance.domT12N), note: "T12 leased listings" },
    {
      metric: "Tenant Retention",
      n: fmtInt(t.multiEpisodeUnits),
      note: `multi-episode units (${t.multiEpisodePct}% of ${fmtInt(t.totalUnits)} observed)`,
    },
    { metric: "Rent Performance", n: fmtInt(c.urusT12), note: "T12 observed urus feeding mix-adjusted YoY" },
    { metric: "Marketing Discipline", n: fmtInt(c.t12Listings), note: "T12 listings scored" },
  ];
  if (scorecard.communityVisibility) {
    rows.push({
      metric: "Inventory Transparency",
      n: fmtInt(scorecard.communityVisibility.perCommunity.length),
      note: "concentrated communities backing the ratio",
    });
  }
  return (
    <View style={{ marginTop: 16 }} wrap={false}>
      <Text style={styles.subHead}>Sample sizes per metric</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 2, paddingRight: 8 }]}>Metric</Text>
        <Text style={[styles.tableHeaderCell, { width: 44, textAlign: "right", paddingRight: 16 }]}>N</Text>
        <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Backing</Text>
      </View>
      {rows.map((r) => (
        <View key={r.metric} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2, paddingRight: 8 }]}>{r.metric}</Text>
          <Text style={[styles.tableCellBold, { width: 44, textAlign: "right", paddingRight: 16 }]}>{r.n}</Text>
          <Text style={[styles.tableCellMuted, { flex: 3 }]}>{r.note}</Text>
        </View>
      ))}
    </View>
  );
}

function MethodologySection({ scorecard, num }: { scorecard: ScorecardData; num: string }) {
  return (
    <View>
      <View wrap={false} minPresenceAhead={80}>
        <SectionHeader
          num={num}
          title="Methodology & limits"
          intro={`What backs this scorecard — classification rationale, coverage universe, per-metric sample sizes, and the version stamp. Rendered against methodology ${scorecard.methodologyVersion}${scorecard.designVersion ? `, design ${scorecard.designVersion}` : ""}. Underlying data is current as of ${fmtDate(scorecard.dataAsOf)}.`}
        />
      </View>

      {scorecard.classificationRationale ? (
        <View wrap={false} minPresenceAhead={40}>
          <Text style={styles.subHead}>Classification rationale</Text>
          <Text style={styles.paragraph}>{scorecard.classificationRationale}</Text>
        </View>
      ) : null}

      <View wrap={false} minPresenceAhead={40}>
        <View style={{ display: "flex", flexDirection: "row", gap: 32, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subHead}>Coverage parameters</Text>
            <MethodologyLabelValue rows={MethodologyCoverageRows(scorecard)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subHead}>Portfolio composition</Text>
            <MethodologyLabelValue rows={MethodologyPortfolioRows(scorecard)} />
          </View>
        </View>
      </View>

      <MethodologySampleSizeTable scorecard={scorecard} />

      <View wrap={false} minPresenceAhead={40} style={{ marginTop: 16 }}>
        <Text style={styles.subHead}>Disclaimer</Text>
        <View style={{ backgroundColor: TILE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 10.5, color: BODY, lineHeight: 1.5 }}>
            Operator IQ scorecards reflect operator behavior observable in our first-party listings
            data. Figures are not portfolio totals; they&rsquo;re what we see. Operators with shorter
            observation history have noisier estimates on metrics built from observed tenancy episodes
            (Tenant Retention, a Kaplan-Meier survival estimate) or multi-year trajectory (Rent
            Performance). See the methodology page for full caveats.
          </Text>
        </View>
      </View>

      <View wrap={false} minPresenceAhead={20} style={{ marginTop: 16 }}>
        <Text style={styles.subHead}>Suggested citation</Text>
        <View style={{ borderWidth: 1, borderStyle: "solid", borderColor: BORDER, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 10, fontFamily: "Courier", color: BODY, lineHeight: 1.5 }}>
            {`Dwellsy IQ, 2026. Operator IQ Scorecard for ${scorecard.pm.name} (${scorecard.market.name}). Methodology ${scorecard.methodologyVersion}${scorecard.designVersion ? ` · Design ${scorecard.designVersion}` : ""}. intel.iq.dwellsy.com/property-managers/${scorecard.pm.slug}`}
          </Text>
        </View>
        <Link src="https://intel.iq.dwellsy.com/methodology" style={{ fontSize: 10.5, fontWeight: 700, color: VIOLET, marginTop: 10 }}>
          Full methodology » intel.iq.dwellsy.com/methodology
        </Link>
      </View>
    </View>
  );
}

// =====================================================================
//  Document
// =====================================================================
export function OperatorProfilePDF({
  view,
  scorecard,
  coverageMap,
}: {
  view: ScorecardView;
  scorecard: ScorecardData;
  coverageMap: CoverageMapImage | null;
}) {
  const hasProperties = !!scorecard.propertyDetail?.properties?.length;
  const glanceTiles = buildGlanceTiles(view.scaleFit);

  return (
    <Document
      title={`${view.header.name} — Scorecard`}
      author="Dwellsy IQ"
      subject={`Property manager scorecard for ${view.header.name}`}
      creator="Dwellsy IQ"
    >
      <Page size="LETTER" style={styles.page} wrap>
        <RunningHeader scorecard={scorecard} />

        {/* Page 1 — cover */}
        <CoverHero header={view.header} />
        <ExecReadout readout={view.readout} maturityNote={view.maturityNote} />
        <AtAGlance tiles={glanceTiles} />
        {view.scaleFit.crossMarket != null ? (
          <CrossMarketFootprint crossMarket={view.scaleFit.crossMarket} />
        ) : null}

        {/* Page 2 — 01 Scale & fit */}
        <View break>
          <ScaleFitSection scaleFit={view.scaleFit} coverageMap={coverageMap} geo={scorecard.geographicCoverage} />
        </View>

        {/* Page 3 — peers + 02 Operating performance */}
        <View break>
          <PeersTable peers={view.peers} />
          <OperatingSection operating={view.operating} />
        </View>

        {/* Page 4 — 03 Momentum + 04 Watch items */}
        <View break>
          <MomentumSection momentum={view.momentum} />
          <View style={{ marginTop: 24 }}>
            <WatchItemsSection items={view.watchItems} />
          </View>
        </View>

        {/* Page 5 — 05 Properties */}
        {hasProperties ? (
          <View break>
            <PropertiesSection scorecard={scorecard} num="05" />
          </View>
        ) : null}

        {/* Page 6 — Methodology */}
        <View break>
          <MethodologySection scorecard={scorecard} num={hasProperties ? "06" : "05"} />
        </View>

        <PageFooter scorecard={scorecard} />
      </Page>
    </Document>
  );
}
