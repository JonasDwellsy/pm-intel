// Scorecard redesign — Rent tier position marker.
// Pure server component; no client hooks.
// Matches the mockup .rt/.rtmark gradient track.

interface RentTierMarkerProps {
  /** 0–1 position on the value→premium track. null = not yet computed. */
  position: number | null;
}

/**
 * A linear value↔premium gradient track with a vertical marker at `position`.
 * When position is null (pending pricing phase), renders a muted "not available" state.
 */
export function RentTierMarker({ position }: RentTierMarkerProps) {
  if (position == null) {
    return (
      <div>
        {/* Muted track placeholder */}
        <div
          style={{
            position: "relative",
            height: "10px",
            background: "#eef1f6",
            borderRadius: "6px",
            margin: "20px 0 6px",
          }}
        />
        <p style={{ fontSize: "10.5px", color: "#aab3c6", margin: 0 }}>
          Rent tier data not yet available.
        </p>
      </div>
    );
  }

  // Clamp to [0, 1]
  const clamped = Math.min(1, Math.max(0, position));
  const leftPct = clamped * 100;

  // Map position to a label
  const tierLabel =
    clamped < 0.33 ? "value" : clamped < 0.67 ? "mid-market" : "premium";
  const caption = `Typical rent near the ${tierLabel === "mid-market" ? "market median" : `${tierLabel} end`} — ${tierLabel}.`;

  return (
    <div>
      {/* Gradient track: value (green) → mid (blue-tint) → premium (violet) */}
      <div
        style={{
          position: "relative",
          height: "10px",
          background: "linear-gradient(90deg,#dff0e5,#e1eef3,#f0ecfa)",
          borderRadius: "6px",
          margin: "20px 0 6px",
        }}
      >
        {/* Anchor labels */}
        <span
          style={{
            position: "absolute",
            top: "-17px",
            left: "16%",
            fontSize: "9px",
            color: "#5b6577",
            transform: "translateX(-50%)",
          }}
        >
          value
        </span>
        <span
          style={{
            position: "absolute",
            top: "-17px",
            left: "50%",
            fontSize: "9px",
            color: "#5b6577",
            transform: "translateX(-50%)",
          }}
        >
          mid
        </span>
        <span
          style={{
            position: "absolute",
            top: "-17px",
            left: "84%",
            fontSize: "9px",
            color: "#5b6577",
            transform: "translateX(-50%)",
          }}
        >
          premium
        </span>

        {/* Vertical marker */}
        <div
          style={{
            position: "absolute",
            top: "-5px",
            left: `${leftPct}%`,
            width: "3px",
            height: "20px",
            background: "#0f1f3f",
            borderRadius: "2px",
            transform: "translateX(-50%)",
          }}
        />
      </div>

      {/* Caption */}
      <p style={{ fontSize: "10.5px", color: "#8894ac", margin: 0 }}>
        {caption}
      </p>
    </div>
  );
}
