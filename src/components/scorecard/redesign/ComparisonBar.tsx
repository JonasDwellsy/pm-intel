// Two-point comparison bar for the re-enriched Operating cards. Unlike
// PositionBar (which needs a full percentile), these metrics have only the
// operator value + one peer median, so we render a magnitude fill (0 → value)
// plus a "median" tick. Fill color carries the good/watch/neutral tone.

import type { MetricTone } from "@/lib/scorecard/operating-detail";

const TONE_FILL: Record<MetricTone, string> = {
  good: "#2f9e6b",
  watch: "#d97834",
  neutral: "#8ea0bd",
};

export function ComparisonBar({
  value,
  median,
  tone,
}: {
  value: number;
  median: number | null;
  tone: MetricTone;
}) {
  // Scale so the larger of value/median sits at ~77% of the track, leaving
  // headroom on both sides. Guard against a zero/undefined scale.
  const scaleMax = Math.max(value, median ?? 0) * 1.3 || 1;
  const valuePct = Math.max(0, Math.min(100, (value / scaleMax) * 100));
  const medianPct =
    median != null ? Math.max(0, Math.min(100, (median / scaleMax) * 100)) : null;

  return (
    <div
      style={{
        position: "relative",
        height: "8px",
        background: "#eef1f6",
        borderRadius: "5px",
      }}
    >
      {/* Magnitude fill, 0 → value */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${valuePct}%`,
          background: TONE_FILL[tone],
          borderRadius: "5px",
        }}
      />
      {/* Peer-median tick */}
      {medianPct != null && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${medianPct}%`,
            top: "-3px",
            bottom: "-3px",
            width: "2px",
            marginLeft: "-1px",
            background: "#5b6577",
            borderRadius: "1px",
          }}
        />
      )}
    </div>
  );
}
