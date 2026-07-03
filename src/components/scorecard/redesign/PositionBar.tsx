// Shared presentational primitive — scorecard redesign.
// Pure server component; no client hooks.

interface PositionBarProps {
  /** Operator's cohort position, 0–1 (0 = bottom, 1 = top).
   *  null → render a muted "n/a" state with no marker. */
  position: number | null;
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Horizontal position bar with P25 / median / P75 tick marks.
 * Matches the `.pos` / `.posmark` / `.poslab` look in scorecard-v5.html.
 *
 * Track: a gradient from warm-amber (low end) through neutral to soft-green
 * (high end), per the mockup's `linear-gradient(90deg,#f3d9a8,#eef0f4
 * 45%,#eef0f4 55%,#bfe3cf)`.
 *
 * Marker: 3 × 16px navy bar positioned at `position * 100%`.
 */
export function PositionBar({ position }: PositionBarProps) {
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
        {/* P25 / med / P75 labels */}
        <div style={{ position: "relative", height: "16px" }}>
          <span
            style={{
              position: "absolute",
              left: "25%",
              top: "2px",
              fontSize: "9px",
              color: "#a0a9ba",
              transform: "translateX(-50%)",
            }}
          >
            P25
          </span>
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "2px",
              fontSize: "9px",
              color: "#a0a9ba",
              transform: "translateX(-50%)",
            }}
          >
            med
          </span>
          <span
            style={{
              position: "absolute",
              left: "75%",
              top: "2px",
              fontSize: "9px",
              color: "#a0a9ba",
              transform: "translateX(-50%)",
            }}
          >
            P75
          </span>
        </div>
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
          background:
            "linear-gradient(90deg,#f3d9a8,#eef0f4 45%,#eef0f4 55%,#bfe3cf)",
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

      {/* Tick labels: P25 / med / P75 */}
      <div style={{ position: "relative", height: "16px" }}>
        <span
          style={{
            position: "absolute",
            left: "25%",
            top: "2px",
            fontSize: "9px",
            color: "#a0a9ba",
            transform: "translateX(-50%)",
          }}
        >
          P25
        </span>
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "2px",
            fontSize: "9px",
            color: "#a0a9ba",
            transform: "translateX(-50%)",
          }}
        >
          med
        </span>
        <span
          style={{
            position: "absolute",
            left: "75%",
            top: "2px",
            fontSize: "9px",
            color: "#a0a9ba",
            transform: "translateX(-50%)",
          }}
        >
          P75
        </span>
      </div>
    </div>
  );
}
