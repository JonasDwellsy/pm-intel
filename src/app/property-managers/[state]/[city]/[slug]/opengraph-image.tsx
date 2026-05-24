// PR #75 — Dynamic Open Graph preview image for scorecard pages.
// PR #77 — Runtime hardening after the first deploy returned 500
// when Slack tried to fetch the image. Three changes:
//
//   1. Removed `fontFamily: "system-ui, ..."` from the JSX styles.
//      Satori (the rendering engine inside next/og's ImageResponse)
//      can't resolve system-font stacks — when none of the names
//      match a loaded font, the render throws. Letting Satori fall
//      back to its built-in default (Noto Sans) keeps the route
//      working out of the box.
//   2. Switched `import * as Sentry from "@sentry/nextjs"` to a
//      dynamic import inside a defensive `reportError` helper.
//      Sentry's auto-instrumentation has historical issues with
//      next/og route modules; the top-level static import was the
//      most likely culprit in the original 500.
//   3. Added `console.error` alongside Sentry so any future runtime
//      failure shows in Vercel runtime logs even if Sentry itself
//      can't load.
//
// Renders a 1200×630 PNG on first request (cached at the edge after
// generation) so Slack / iMessage / email / LinkedIn unfurls show
// a branded scorecard preview instead of Vercel's default card.
//
// Composition (left → right, top → bottom):
//   - Dwellsy IQ logo + wordmark, top-left
//   - Operator name, large + navy, dominant element
//   - "City, ST · Classification" subhead
//   - Star summary row: ⭐ N gold + ⭐ M silver
//   - Bottom: "Ranked within [MSA] · [Classification] cohort"
//
// Two code paths share this file because the [slug] segment is
// overloaded (PM slug or quadrant segment). Segment routes get a
// minimal Dwellsy IQ branded card (no per-operator data); scorecard
// routes get the full composition.
//
// Failure modes are instrumented; on any error we fall through to
// the minimal branded card rather than throwing (a broken OG image
// is much worse than a generic one for the share experience).

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { isQuadrantSegment } from "@/lib/slugify";
import {
  countOperatorStars,
  starableAxisCount,
} from "@/lib/operators/stars";
import type { ScorecardData } from "@/lib/types";

/** PR #80 — Load the canonical Dwellsy IQ wordmark from public/
 *  and embed it as a data URL in the OG composition. Module-scope
 *  cache means cold lambdas read the file once; warm lambdas reuse
 *  the in-memory base64.
 *
 *  Reading from `public/` works server-side because Vercel
 *  includes the public dir in the function bundle's filesystem
 *  view (relative to process.cwd()). Falls through to null on any
 *  read error so the OG render still works (without the logo)
 *  rather than 500ing if the asset goes missing. */
let cachedLogoDataUrl: string | null | undefined;

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const path = join(process.cwd(), "public", "dwellsy-iq-logo.png");
    const buf = await readFile(path);
    cachedLogoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } catch (err) {
    console.error("[scorecard-opengraph-image] failed to load logo", err);
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

/** PR #77 — Defensive error reporter. Dynamically imports Sentry
 *  inside a try/catch so:
 *
 *    1. The static `import * as Sentry from "@sentry/nextjs"` at
 *       module top (which had a history of breaking next/og routes
 *       via Sentry's auto-instrumentation) is no longer there.
 *    2. If Sentry itself fails to load for any reason, the OG image
 *       route still emits the error to Vercel runtime logs so the
 *       failure mode is debuggable.
 *    3. Sentry errors NEVER bubble up — they're swallowed inside
 *       this helper so they can't crash the OG render, which would
 *       defeat the entire purpose of falling back to a branded
 *       card. */
async function reportError(
  err: unknown,
  context: { component: string; extra?: Record<string, unknown> }
): Promise<void> {
  // Always log to Vercel runtime first — even if Sentry blows up.
  console.error(`[${context.component}] runtime error`, err, context.extra);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err, {
      tags: { component: context.component },
      extra: context.extra,
    });
  } catch (sentryErr) {
    console.error(
      `[${context.component}] Sentry capture also failed`,
      sentryErr
    );
  }
}

// next/og runs on the Node.js runtime here because we need Prisma to
// resolve the operator from the slug. Edge runtime would be faster
// but doesn't expose the Prisma client we already use server-side.
export const runtime = "nodejs";

// Open Graph standard dimensions. Slack / iMessage / LinkedIn /
// Twitter all crop to ~1.91:1; 1200×630 hits the sweet spot.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dwellsy IQ scorecard preview";

// Brand palette — mirrors globals.css CSS variables.
const COLOR_NAVY = "#0f1f3f";
const COLOR_TEAL = "#1b6e8c";
const COLOR_GOLD = "#E5A800";
const COLOR_SILVER = "#9CA3AF";
const COLOR_MUTED = "#5f6b80";
const COLOR_GRID = "#e1e5ec";
const COLOR_BG = "#ffffff";

type RouteParams = { state: string; city: string; slug: string };

export default async function Image({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;

  // Segment routes (e.g., /tennessee/chattanooga/large-multifamily)
  // don't carry per-operator data; fall through to the branded card.
  if (isQuadrantSegment(slug)) {
    return brandedFallback("Property manager intelligence");
  }

  try {
    const pm = await prisma.pM.findUnique({ where: { slug } });
    if (!pm) return brandedFallback("Property manager intelligence");

    const scorecard = JSON.parse(pm.scorecardData) as ScorecardData;
    const { goldCount, silverCount } = countOperatorStars(scorecard);
    const axes = starableAxisCount(scorecard);

    const operatorName = scorecard.pm.name;
    // scorecard.market.name is the city name (e.g., "Chattanooga");
    // .state is the 2-letter code; .fullName is "City, ST". Use the
    // pre-formatted fullName when available, fall back to name + state.
    const cityState =
      scorecard.market.fullName ??
      `${scorecard.market.name}, ${scorecard.market.state}`;
    const classification =
      scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant ?? "Operator";
    const cohortLine =
      `Ranked within ${scorecard.market.name} MSA · ${classification} cohort`;
    const logoDataUrl = await getLogoDataUrl();

    return new ImageResponse(
      (
        <div
          style={{
            // PR #77 — `fontFamily` deliberately omitted. Satori
            // can't resolve system-font stacks; specifying one was
            // the most likely cause of the original 500. Letting
            // Satori fall back to its built-in default keeps the
            // route working out of the box.
            //
            // PR #80 — root is a fixed-height flex column. The
            // bottom bar uses marginTop:auto to stick to the
            // bottom rather than position:absolute, which was
            // overlapping the star chips in the previous design.
            width: "100%",
            height: "100%",
            backgroundColor: COLOR_BG,
            display: "flex",
            flexDirection: "column",
            padding: "56px 64px",
            color: COLOR_NAVY,
          }}
        >
          {/* Top — branded eyebrow. PR #80: use the actual Dwellsy
              IQ wordmark from public/ instead of the standalone
              "IQ" badge + text combo, which read as redundant. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: COLOR_NAVY,
            }}
          >
            {logoDataUrl ? (
              // 1000x313 source aspect ratio; rendering at 140x44
              // preserves the wordmark proportions.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoDataUrl}
                width={140}
                height={44}
                alt="Dwellsy IQ"
                style={{ display: "block" }}
              />
            ) : (
              // Fallback if the logo file can't be loaded — still
              // ship the brand text so the OG image isn't broken.
              <span style={{ fontSize: 28, fontWeight: 800 }}>Dwellsy IQ</span>
            )}
            <span style={{ color: COLOR_MUTED, fontWeight: 500 }}>·</span>
            <span style={{ color: COLOR_TEAL, fontWeight: 600, fontSize: 18 }}>
              Property Manager Scorecard
            </span>
          </div>

          {/* Center — operator name + meta */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 64,
              gap: 18,
            }}
          >
            <div
              style={{
                fontSize: operatorName.length > 28 ? 72 : 88,
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                color: COLOR_NAVY,
              }}
            >
              {operatorName}
            </div>
            {/* PR #79 — JSX with multiple expression children (e.g.
                `{cityState} · {classification}`) is what Satori
                actually sees as 3 separate text nodes, which trips
                its strict-mode check requiring display:flex on
                multi-child divs. The simplest fix is to consolidate
                into a single template-literal child. Same fix below
                on the "across N dimensions" line. */}
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                color: COLOR_MUTED,
              }}
            >
              {`${cityState} · ${classification}`}
            </div>
          </div>

          {/* Star summary row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              marginTop: 40,
            }}
          >
            <StarChip color={COLOR_GOLD} count={goldCount} label="gold" />
            <StarChip color={COLOR_SILVER} count={silverCount} label="silver" />
            <div
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: COLOR_MUTED,
              }}
            >
              {`across ${axes} performance dimensions`}
            </div>
          </div>

          {/* Bottom — cohort context bar. PR #80: switched from
              position:absolute (which was overlapping the chips,
              hence the horizontal line going through the gold/silver
              pills in the rendered image) to flex with marginTop
              auto, which pushes the bar to the bottom of the
              fixed-height container without overlapping. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "auto",
              paddingTop: 28,
              borderTop: `1px solid ${COLOR_GRID}`,
              fontSize: 22,
              color: COLOR_NAVY,
            }}
          >
            <span style={{ fontWeight: 600 }}>{cohortLine}</span>
            <span style={{ color: COLOR_TEAL, fontWeight: 600 }}>
              iq.dwellsy.com →
            </span>
          </div>
        </div>
      ),
      { ...size }
    );
  } catch (err) {
    await reportError(err, {
      component: "scorecard-opengraph-image",
      extra: { slug },
    });
    return brandedFallback("Property manager intelligence");
  }
}

/** Branded fallback rendered when:
 *   - the slug is a quadrant segment (no per-operator data),
 *   - the PM lookup misses (stale link),
 *   - any unexpected error fires during render.
 *
 *  Sentry-instrumented at the call site so we know if real users
 *  are hitting it. */
function brandedFallback(subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          // PR #77 — fontFamily omitted (see note on the main
          // composition above). Satori uses its built-in default.
          // PR #80 — DwellsyMark inline-badge removed; the wordmark
          // text is the brand on the fallback card too.
          width: "100%",
          height: "100%",
          backgroundColor: COLOR_NAVY,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          color: "#ffffff",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: "-0.025em",
          }}
        >
          Dwellsy IQ
        </div>
        <div style={{ fontSize: 28, color: "#cdd5e3", fontWeight: 500 }}>
          {subtitle}
        </div>
      </div>
    ),
    { ...size }
  );
}

/** PR #78 — Convert a brand hex color to a 10% alpha tint via
 *  explicit rgba(). Replaces the previous `${color}1a` 8-digit
 *  hex form — Satori claims CSS Colors level 4 support but has
 *  edge cases parsing the concatenated hex-alpha notation, so
 *  rgba() removes that risk entirely. Only handles `#RRGGBB` form
 *  (which all our brand colors use); falls back to the input
 *  string if the format is unexpected. */
function hexTint(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** PR #80 — Inline SVG star glyph. PR #78 swapped this for the
 *  unicode ★ character on the theory that Satori's built-in font
 *  would have it; it doesn't (the rendered image showed a missing-
 *  glyph box). SVG is the reliable path.
 *
 *  PR #75's original SVG used relative `l` commands with condensed
 *  decimals (e.g., `6.6.96` = `6.6` then `.96`), which is a known
 *  trip for some SVG parsers. This version uses absolute `L`
 *  commands with explicit commas between coordinates so the path
 *  is unambiguous. Geometry is identical to the original 5-point
 *  star shape. */
function StarGlyph({ color }: { color: string }) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M12,2.6 L14.95,8.58 L21.55,9.54 L16.77,14.2 L17.9,20.78 L12,17.7 L6.1,20.78 L7.23,14.2 L2.45,9.54 L9.05,8.58 Z" />
    </svg>
  );
}

/** Star chip with count badge. Used twice (gold + silver) on the
 *  scorecard composition. Visual mirrors the StarSummaryChip pattern
 *  in src/components/scorecard/StarSummaryChip.tsx — colored star
 *  glyph + numeric count + lowercase label. */
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 999,
        backgroundColor: hexTint(color, 0.1),
        border: `1px solid ${color}`,
      }}
    >
      <StarGlyph color={color} />
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: COLOR_NAVY,
          lineHeight: 1,
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: COLOR_MUTED,
          letterSpacing: "0.06em",
        }}
      >
        {label.toUpperCase()}
      </span>
    </div>
  );
}
