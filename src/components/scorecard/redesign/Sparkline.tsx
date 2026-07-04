// Shared presentational primitive — scorecard redesign.
// Pure server component; no client hooks.

import type { MomentumDirection } from "@/lib/scorecard/momentum";

interface SparklineProps {
  /** Ordered data series (oldest → newest). */
  series: number[];
  /** Momentum direction — used to pick the line color. */
  direction: MomentumDirection;
}

/**
 * Pick a stroke color based on MomentumDirection.
 * growing / quality-improving → good token (#3e7c3e proxy: #1a7f5a from mockup)
 * declining → bad token (#a63a2a)
 * volatile → amber (#9a6a12)
 * stable / insufficient → muted-2 (#8a92a2)
 */
function strokeColor(direction: MomentumDirection): string {
  switch (direction) {
    case "growing":
      return "#1a7f5a";
    case "declining":
      return "#a63a2a";
    case "volatile":
      return "#9a6a12";
    case "stable":
    case "insufficient":
    default:
      return "#8a92a2";
  }
}

/**
 * Normalize a series into SVG coordinates.
 * viewBox: 0 0 100 30 (matches mockup).
 * y is inverted (SVG 0 = top), so we map max → yMin, min → yMax.
 */
function toPoints(series: number[]): string {
  const SVG_W = 100;
  const SVG_H = 30;
  const PADDING = 4; // vertical padding so line doesn't clip edges

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1; // avoid div-by-zero for flat series

  const step = series.length > 1 ? SVG_W / (series.length - 1) : 0;

  return series
    .map((v, i) => {
      const x = i * step;
      // Normalize: min → (SVG_H - PADDING), max → PADDING
      const y = SVG_H - PADDING - ((v - min) / range) * (SVG_H - PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Small inline SVG sparkline.
 * Matches the `.sparks` SVG polylines in scorecard-v5.html:
 *   width="100%" height="30" viewBox="0 0 100 30" preserveAspectRatio="none"
 *
 * When series.length < 2, renders a muted flat placeholder line at mid-height.
 */
export function Sparkline({ series, direction }: SparklineProps) {
  const color = strokeColor(direction);

  // Flat placeholder for insufficient data
  if (series.length < 2) {
    return (
      <svg
        width="100%"
        height="30"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points="0,15 100,15"
          fill="none"
          stroke="#d5dbe3"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  const points = toPoints(series);

  return (
    <svg
      width="100%"
      height="30"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
