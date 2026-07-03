// Scorecard redesign — Operating Performance section (02).
// Server component; no client hooks.
// Renders evidence cards per the `.mcard` pattern in scorecard-v5.html.

import type { OperatingView, MetricRow } from "@/lib/scorecard/view-model";
import { LabelChip } from "./LabelChip";
import { PositionBar } from "./PositionBar";

interface OperatingPerformanceSectionProps {
  operating: OperatingView;
}

/** Star glyph rendered when metric.star is "gold" or "silver". */
function StarGlyph({ star }: { star: MetricRow["star"] }) {
  if (!star) return null;
  const color = star === "gold" ? "#d4a017" : "#9aa4b2";
  return (
    <span style={{ color, fontSize: "13px", lineHeight: 1 }}>★</span>
  );
}

/** "Strongest / Watch" chip row — pill-style tags from the mockup .swchip. */
function SwChipRow({ strongest, watch }: { strongest: string[]; watch: string[] }) {
  if (strongest.length === 0 && watch.length === 0) return null;

  const chipStyle: React.CSSProperties = {
    fontSize: "11px",
    padding: "3px 9px",
    borderRadius: "20px",
    border: "1px solid #e0e5ee",
    display: "inline-block",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
        margin: "0 0 16px",
        fontSize: "11.5px",
        color: "#5b6577",
      }}
    >
      {strongest.length > 0 && (
        <>
          <span>Strongest:</span>
          {strongest.map((name) => (
            <span key={name} style={chipStyle}>
              <span style={{ fontWeight: 700, color: "#1a7f5a" }}>{name}</span>
            </span>
          ))}
        </>
      )}
      {strongest.length > 0 && watch.length > 0 && (
        <span style={{ margin: "0 2px" }}>&nbsp;·&nbsp;</span>
      )}
      {watch.length > 0 && (
        <>
          <span>Watch:</span>
          {watch.map((name) => (
            <span key={name} style={chipStyle}>
              <span style={{ fontWeight: 700, color: "#5b6577" }}>{name}</span>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/** Single evidence card matching the mockup .mcard. */
function MetricCard({ metric }: { metric: MetricRow }) {
  const subText = metric.sub.join(" · ");

  return (
    <div
      style={{
        border: "1px solid #e2e7ef",
        borderRadius: "10px",
        padding: "13px 15px",
        marginBottom: "11px",
      }}
    >
      {/* Card header: title + star + spacer + label chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "5px",
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          {metric.title}
        </span>
        <StarGlyph star={metric.star} />
        {/* spacer */}
        <span style={{ flex: 1 }} />
        <LabelChip label={metric.label} />
      </div>

      {/* Interpretive line — uses benchmark as the context sentence */}
      {metric.benchmark && (
        <div
          style={{
            fontSize: "12.5px",
            color: "#2a3547",
            marginBottom: "12px",
          }}
        >
          {metric.benchmark}
        </div>
      )}

      {/* Evidence row: big value + position bar + benchmark text */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "74px 1fr 150px",
          gap: "14px",
          alignItems: "center",
        }}
      >
        {/* Big value */}
        <div>
          <span
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "#0f1f3f",
              lineHeight: 1.1,
              display: "block",
            }}
          >
            {metric.value}
          </span>
        </div>

        {/* Position bar */}
        <div>
          <PositionBar position={metric.position} />
        </div>

        {/* Benchmark label */}
        <div
          style={{
            fontSize: "11.5px",
            color: "#5b6577",
          }}
        >
          {metric.benchmark}
        </div>
      </div>

      {/* Sub-metric strip */}
      {subText && (
        <div
          style={{
            marginTop: "11px",
            paddingTop: "9px",
            borderTop: "1px solid #f0f2f6",
            fontSize: "11.5px",
            color: "#5b6577",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {metric.sub.map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      )}

      {/* Static "▸ Peer comparison" disclose affordance */}
      <div
        style={{
          color: "#8894ac",
          fontSize: "11px",
          marginTop: "10px",
          marginBottom: "2px",
        }}
      >
        ▸ Peer comparison
      </div>
    </div>
  );
}

/**
 * "02 Operating Performance" section:
 *  - Numbered header + sectionLabel chip
 *  - Takeaway banner
 *  - Strongest / Watch chip row
 *  - One evidence card per metric
 */
export function OperatingPerformanceSection({ operating }: OperatingPerformanceSectionProps) {
  return (
    <div
      id="operating-performance"
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
          02
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          Operating Performance
        </span>
        <LabelChip label={operating.sectionLabel} />
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
        {operating.takeaway}
      </div>

      {/* Strongest / Watch chip row */}
      <SwChipRow strongest={operating.strongest} watch={operating.watch} />

      {/* Evidence cards */}
      {operating.metrics.map((metric) => (
        <MetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}
