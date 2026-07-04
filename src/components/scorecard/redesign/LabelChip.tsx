// Shared presentational primitive — scorecard redesign.
// Pure server component; no client hooks.

import type { ScoreLabel } from "@/lib/scorecard/labels";

/** Maps a ScoreLabel (or arbitrary string) to a background/text color pair. */
function chipStyle(label: string): { background: string; color: string } {
  switch (label as ScoreLabel | string) {
    case "strong":
      // green: good token (#3e7c3e) on good-soft (#e4eedd)
      return { background: "#dff3e9", color: "#1a7f5a" };
    case "good":
      // teal: teal-700 (#155772) on teal-soft (#e1eef3)
      return { background: "#e1eef3", color: "#155772" };
    case "neutral":
      // muted: muted-2 (#8a92a2) on surface-soft (#f2f5f8)
      return { background: "#eef0f4", color: "#5b6577" };
    case "watch":
      // amber: inline hex per brief (no token)
      return { background: "#fbefd8", color: "#9a6a12" };
    case "insufficient":
      // muted grey: same as neutral but lighter
      return { background: "#eef0f4", color: "#8a92a2" };
    // MomentumDirection values + arbitrary strings
    case "growing":
      return { background: "#dff3e9", color: "#1a7f5a" };
    case "declining":
      return { background: "#f5e3df", color: "#a63a2a" };
    case "volatile":
      return { background: "#fbefd8", color: "#9a6a12" };
    case "stable":
      return { background: "#eef0f4", color: "#5b6577" };
    case "mixed":
      // violet: inline hex per brief (no token)
      return { background: "#f0ecfa", color: "#6b4ea8" };
    default:
      // Arbitrary string — render as muted grey
      return { background: "#eef0f4", color: "#5b6577" };
  }
}

interface LabelChipProps {
  label: ScoreLabel | string;
}

/** Small uppercase pill. Color is derived from the label value. */
export function LabelChip({ label }: LabelChipProps) {
  const { background, color } = chipStyle(label);

  return (
    <span
      style={{
        background,
        color,
        fontSize: "10.5px",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "5px",
        whiteSpace: "nowrap",
        display: "inline-block",
        textTransform: "uppercase",
        letterSpacing: "0.01em",
        lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  );
}
