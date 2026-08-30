// Shared presentational primitive — scorecard redesign.
// Pure server component; no client hooks.

/** A labelled tick on the track. `at` is 0-1 along the bar. */
export interface BarTick {
  at: number;
  label: string;
}

/** Cohort default: the operator sits somewhere in a peer distribution, so the
 *  reference points are that distribution's quartiles. */
const COHORT_TICKS: BarTick[] = [
  { at: 0.25, label: "P25" },
  { at: 0.5, label: "med" },
  { at: 0.75, label: "P75" },
];

/** Warm at the bottom, neutral through the middle, green at the top. */
const COHORT_GRADIENT =
  "linear-gradient(90deg,#f3d9a8,#eef0f4 45%,#eef0f4 55%,#bfe3cf)";

interface PositionBarProps {
  /** Position along the track, 0–1 (0 = bottom, 1 = top).
   *  null → render a muted "n/a" state with no marker. */
  position: number | null;
  /** Reference marks under the track. Defaults to the cohort quartiles;
   *  an absolutely-scored metric passes its own thresholds instead. */
  ticks?: BarTick[];
  /** Track fill. Defaults to the cohort gradient. */
  gradient?: string;
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Tick labels under the track, positioned by fraction. */
function Ticks({ ticks }: { ticks: BarTick[] }) {
  return (
    <div style={{ position: "relative", height: "16px" }}>
      {ticks.map((t) => (
        <span
          key={t.label}
          style={{
            position: "absolute",
            left: `${clamp(t.at, 0, 1) * 100}%`,
            top: "2px",
            fontSize: "9px",
            color: "#a0a9ba",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Horizontal position bar with reference tick marks.
 * Matches the `.pos` / `.posmark` / `.poslab` look in scorecard-v5.html.
 *
 * Marker: 3 × 16px navy bar positioned at `position * 100%`.
 */
export function PositionBar({
  position,
  ticks = COHORT_TICKS,
  gradient = COHORT_GRADIENT,
}: PositionBarProps) {
  const clamped = position != null ? clamp(position, 0, 1) : null;

  if (clamped == null) {
    // n/a state: show the track in a muted tone, no marker
    return (
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "relative",
            height: "8px",
            background: "#eef0f4",
            borderRadius: "5px",
          }}
        />
        <Ticks ticks={ticks} />
        {/* n/a label */}
        <span
          style={{
            fontSize: "10px",
            color: "#a0a9ba",
            fontStyle: "italic",
          }}
        >
          n/a
        </span>
      </div>
    );
  }

  const pct = `${(clamped * 100).toFixed(1)}%`;

  return (
    <div style={{ position: "relative" }}>
      {/* Track */}
      <div
        style={{
          position: "relative",
          height: "8px",
          background: gradient,
          borderRadius: "5px",
        }}
      >
        {/* Marker */}
        <span
          style={{
            position: "absolute",
            top: "-4px",
            left: pct,
            width: "3px",
            height: "16px",
            background: "#0f1f3f",
            borderRadius: "2px",
            transform: "translateX(-50%)",
            display: "block",
          }}
        />
      </div>

      <Ticks ticks={ticks} />
    </div>
  );
}
