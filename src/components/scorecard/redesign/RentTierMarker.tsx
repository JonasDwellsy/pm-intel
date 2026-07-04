// Scorecard redesign — Rent tier position marker.
// Pure server component; no client hooks.
// Matches the mockup .rt/.rtmark gradient track.

import type { RentTierDetail } from "@/lib/scorecard/rent-tier";

interface RentTierMarkerProps {
  /** Rich rent-tier detail. null = not yet computed. */
  detail: RentTierDetail | null;
}

/**
 * A linear value↔premium gradient track with a vertical marker at `detail.position`.
 * When detail is null (pending pricing phase), renders a muted "not available" state.
 */
export function RentTierMarker({ detail }: RentTierMarkerProps) {
  if (detail == null) {
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
  const clamped = Math.min(1, Math.max(0, detail.position));
  const leftPct = clamped * 100;

  // Map position to a tier word
  const tierWord =
    clamped < 0.33 ? "value" : clamped < 0.67 ? "mid-market" : "premium";

  // Line 2: market P25/P75, explicitly framed as the other-operator cohort —
  // the operator's own sample size lives in line 1 with its median, so this
  // line isn't mistaken for a comparison against the operator's own listings.
  let line2: string | null = null;
  if (detail.marketP25 != null && detail.marketP75 != null) {
    line2 = `Market P25 $${Math.round(detail.marketP25).toLocaleString()} – P75 $${Math.round(detail.marketP75).toLocaleString()} · other operators in the MSA`;
  }

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

      {/* Caption line 1 — operator's own median + sample size together */}
      <p style={{ fontSize: "10.5px", color: "#8894ac", margin: 0 }}>
        {`≈ $${Math.round(detail.rentMedian).toLocaleString()}/mo median${detail.sampleSize != null ? ` (from ${detail.sampleSize} recent listing${detail.sampleSize === 1 ? "" : "s"})` : ""} · ${tierWord} end`}
      </p>

      {/* Caption line 2: market range vs. other operators in the MSA */}
      {line2 != null && (
        <p style={{ fontSize: "9.5px", color: "#8894ac", margin: "2px 0 0" }}>
          {line2}
        </p>
      )}
    </div>
  );
}
