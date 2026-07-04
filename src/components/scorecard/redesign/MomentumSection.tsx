// Scorecard redesign — Momentum section (03).
// Pure server component; no client hooks.
// Renders the 4-sparkline small-multiples row per the `.sparks` pattern in scorecard-v5.html.

import type { MomentumView } from "@/lib/scorecard/view-model";
import type { MomentumDirection } from "@/lib/scorecard/momentum";
import { LabelChip } from "./LabelChip";
import { Sparkline } from "./Sparkline";

interface MomentumSectionProps {
  momentum: MomentumView;
}

/** Direction glyph: ↑ growing/quality-improving, → stable, ↓ declining, blank for volatile/insufficient. */
function DirectionGlyph({ direction }: { direction: MomentumDirection }) {
  switch (direction) {
    case "growing":
      return <span style={{ color: "#1a7f5a", fontWeight: 700 }}>↑</span>;
    case "declining":
      return <span style={{ color: "#a63a2a", fontWeight: 700 }}>↓</span>;
    case "stable":
      return <span style={{ color: "#5b6577", fontWeight: 700 }}>→</span>;
    case "volatile":
      return <span style={{ color: "#9a6a12", fontWeight: 700 }}>~</span>;
    case "insufficient":
    default:
      return null;
  }
}

/**
 * Single sparkline cell in the small-multiples grid.
 * When direction is "insufficient", shows "building history" instead of a line.
 */
function SparkCell({
  spark,
}: {
  spark: MomentumView["sparklines"][number];
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e7ef",
        borderRadius: "10px",
        padding: "12px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
      }}
    >
      {/* Label + direction glyph row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#5b6577",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {spark.label}
        </span>
        <DirectionGlyph direction={spark.direction} />
      </div>

      {/* Sparkline or "building history" placeholder */}
      {spark.direction === "insufficient" ? (
        <div
          style={{
            height: "30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "#8a92a2",
              fontStyle: "italic",
            }}
          >
            building history
          </span>
        </div>
      ) : (
        <Sparkline series={spark.series} direction={spark.direction} />
      )}
    </div>
  );
}

/**
 * "03 Momentum" section:
 *  - Numbered header + direction chip
 *  - Takeaway banner
 *  - 4-column small-multiples sparkline row
 *  - Collapsed "▸ View full history" affordance (static this phase)
 */
export function MomentumSection({ momentum }: MomentumSectionProps) {
  return (
    <div
      id="momentum"
      className="dq-section"
      style={{ borderTop: "2px solid #eef1f6", padding: "20px 0 6px" }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            color: "#aab3c6",
            fontWeight: 700,
          }}
        >
          03
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          Momentum
        </span>
        <LabelChip label={momentum.direction} />
      </div>

      {/* Takeaway */}
      <div
        style={{
          background: "#f7f9fc",
          borderLeft: "3px solid #1b6e8c",
          padding: "9px 12px",
          borderRadius: "0 6px 6px 0",
          color: "#2a3547",
          margin: "6px 0 14px",
          fontSize: "12.5px",
        }}
      >
        {momentum.takeaway}
      </div>

      {/* Small-multiples sparkline row. "footprint" is included only when its
          series is non-empty (single-market operators have no cross-market
          history to show); the grid sizes to however many cells remain, so
          the common 4-cell case is unaffected and the 5-cell (multi-market)
          case doesn't overflow a fixed 4-col grid. */}
      {(() => {
        const cells = momentum.sparklines.filter(
          (spark) => spark.key !== "footprint" || spark.series.length > 0
        );
        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
              gap: "10px",
            }}
          >
            {cells.map((spark) => (
              <SparkCell key={spark.key} spark={spark} />
            ))}
          </div>
        );
      })()}

      {/* Static "▸ View full history" disclose affordance */}
      <div
        style={{
          color: "#8894ac",
          fontSize: "11px",
          marginTop: "12px",
          marginBottom: "2px",
        }}
      >
        ▸ View full history
      </div>
    </div>
  );
}
