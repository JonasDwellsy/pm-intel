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
import { prisma } from "@/lib/prisma";
import { isQuadrantSegment } from "@/lib/slugify";
import {
  countOperatorStars,
  starableAxisCount,
} from "@/lib/operators/stars";
import type { ScorecardData } from "@/lib/types";

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

    return new ImageResponse(
      (
        <div
          style={{
            // PR #77 — `fontFamily` deliberately omitted. Satori
            // can't resolve system-font stacks; specifying one was
            // the most likely cause of the original 500. Letting
            // Satori fall back to its built-in default (Noto Sans)
            // keeps the route working out of the box.
            width: "100%",
            height: "100%",
            backgroundColor: COLOR_BG,
            display: "flex",
            flexDirection: "column",
            padding: "56px 64px",
            color: COLOR_NAVY,
            position: "relative",
          }}
        >
          {/* Top — branded eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: COLOR_NAVY,
            }}
          >
            <DwellsyMark />
            <span>Dwellsy IQ</span>
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
              marginTop: 88,
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
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                color: COLOR_MUTED,
              }}
            >
              {cityState} · {classification}
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
              across {axes} performance dimensions
            </div>
          </div>

          {/* Bottom — cohort context bar */}
          <div
            style={{
              position: "absolute",
              left: 64,
              right: 64,
              bottom: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 28,
              borderTop: `1px solid ${COLOR_GRID}`,
              fontSize: 22,
              color: COLOR_NAVY,
            }}
          >
            <span style={{ fontWeight: 600 }}>{cohortLine}</span>
            <span style={{ color: COLOR_TEAL, fontWeight: 600 }}>
              dwellsy.com →
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
        <DwellsyMark inverted />
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

/** Inline SVG-as-JSX mark — keeps the OG image self-contained
 *  (no font / image fetch round-trips). The mark is a stylized
 *  "IQ" badge rendered in the brand teal. */
function DwellsyMark({ inverted = false }: { inverted?: boolean }) {
  const bg = inverted ? "#ffffff" : COLOR_TEAL;
  const fg = inverted ? COLOR_TEAL : "#ffffff";
  return (
    <div
      style={{
        width: 44,
        height: 44,
        backgroundColor: bg,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        fontWeight: 800,
        color: fg,
        letterSpacing: "-0.04em",
      }}
    >
      IQ
    </div>
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
        backgroundColor: `${color}1a`, // 10% alpha tint
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
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StarGlyph({ color }: { color: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
