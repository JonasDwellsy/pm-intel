// Big classification quadrant — 2×2 scatter with operator-of-record callout.
// Peer positions are synthesized deterministically from the quadrant index so
// the visual is stable per quadrant but readable as "cohort scatter".

type QuadrantKey =
  | "ss-independent"
  | "ss-institutional"
  | "mf-independent"
  | "mf-institutional";

function classify(q: string): QuadrantKey {
  const norm = q.toLowerCase();
  if (norm.includes("mf") || norm.includes("btr")) {
    return norm.includes("institutional") ? "mf-institutional" : "mf-independent";
  }
  return norm.includes("institutional") ? "ss-institutional" : "ss-independent";
}

// Pre-positioned peer dots within the chart frame (W×H = 880×560 viewBox).
// Spread across the four quadrants in a stable, plausibly-distributed pattern.
const PEER_DOTS: Array<{ x: number; y: number }> = [
  // Top-left (Scattered / Independent)
  { x: 140, y: 110 }, { x: 220, y: 80 }, { x: 200, y: 180 }, { x: 110, y: 200 },
  // Top-right (MF / Independent)
  { x: 560, y: 95 }, { x: 660, y: 130 }, { x: 740, y: 80 }, { x: 620, y: 200 }, { x: 700, y: 200 },
  // Bottom-left (Scattered / Institutional)
  { x: 160, y: 380 }, { x: 240, y: 420 }, { x: 130, y: 460 }, { x: 280, y: 470 },
  // Bottom-right (MF / Institutional)
  { x: 580, y: 380 }, { x: 700, y: 360 }, { x: 660, y: 460 }, { x: 740, y: 440 },
];

const HYBRID_DOTS: Array<{ x: number; y: number }> = [
  { x: 430, y: 180 }, { x: 470, y: 380 }, { x: 410, y: 280 },
];

// Operator-of-record dot placement per quadrant (visible inside the quadrant).
const OP_POSITION: Record<QuadrantKey, { x: number; y: number }> = {
  "ss-independent": { x: 170, y: 150 },
  "ss-institutional": { x: 200, y: 430 },
  "mf-independent": { x: 660, y: 150 },
  "mf-institutional": { x: 680, y: 410 },
};

// Corner label config — only the operator's quadrant gets the orange treatment.
const QUADRANT_CORNERS: Array<{
  key: QuadrantKey;
  label: string;
  x: number;
  y: number;
  anchor: "start" | "end";
}> = [
  { key: "ss-independent", label: "Scattered Site · Independent", x: 40, y: 40, anchor: "start" },
  { key: "mf-independent", label: "MF / BTR · Independent", x: 840, y: 40, anchor: "end" },
  { key: "ss-institutional", label: "Scattered Site · Institutional", x: 40, y: 540, anchor: "start" },
  { key: "mf-institutional", label: "MF / BTR · Institutional", x: 840, y: 540, anchor: "end" },
];

export function QuadrantGrid({
  quadrant,
  hybrid = false,
  variant = "full",
  operatorName,
  operatorDetail,
}: {
  quadrant: string;
  hybrid?: boolean;
  variant?: "full" | "compact";
  operatorName?: string;
  operatorDetail?: string;
}) {
  const activeKey = classify(quadrant);

  if (variant === "compact") {
    // 240×220 mini quadrant for inline use (no peer scatter, just position).
    const opPosMini: Record<QuadrantKey, { x: number; y: number }> = {
      "ss-independent": { x: 60, y: 60 },
      "mf-independent": { x: 180, y: 60 },
      "ss-institutional": { x: 60, y: 165 },
      "mf-institutional": { x: 180, y: 165 },
    };
    const op = opPosMini[activeKey];
    return (
      <svg
        viewBox="0 0 240 220"
        className="block h-auto w-full"
        aria-label={`Operator quadrant: ${quadrant}`}
      >
        <rect x="0" y="0" width="240" height="220" fill="#F2F5F8" />
        <line x1="120" y1="6" x2="120" y2="214" stroke="#0F1F3F" strokeWidth="1.25" />
        <line x1="6" y1="110" x2="234" y2="110" stroke="#0F1F3F" strokeWidth="1.25" />
        <circle cx={op.x} cy={op.y} r="14" fill="#D97834" opacity="0.18" />
        <circle cx={op.x} cy={op.y} r="9" fill="#D97834" stroke="#FFFFFF" strokeWidth="2.5" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 880 560"
      className="block h-auto w-full"
      aria-label={`Classification scatter: ${quadrant}`}
    >
      <rect x="0" y="0" width="880" height="560" fill="#F2F5F8" />
      {/* Crosshair */}
      <line x1="440" y1="20" x2="440" y2="540" stroke="#0F1F3F" strokeWidth="1.5" />
      <line x1="20" y1="280" x2="860" y2="280" stroke="#0F1F3F" strokeWidth="1.5" />
      {/* Axis arrows */}
      <text x="60" y="296" fill="#5C6573" fontSize="11" fontWeight="700"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
        ← Scattered site
      </text>
      <text x="820" y="296" textAnchor="end" fill="#5C6573" fontSize="11" fontWeight="700"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
        MF / BTR →
      </text>
      <text x="450" y="40" fill="#5C6573" fontSize="11" fontWeight="700"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
        ↑ Independent
      </text>
      <text x="450" y="530" fill="#5C6573" fontSize="11" fontWeight="700"
        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
        ↓ Institutional
      </text>
      {/* Corner labels */}
      {QUADRANT_CORNERS.map((c) => {
        const active = c.key === activeKey;
        return (
          <text
            key={c.key}
            x={c.x}
            y={c.y}
            textAnchor={c.anchor}
            fill={active ? "#D97834" : "#8A92A2"}
            fontSize="11"
            fontWeight="700"
            style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {c.label}
          </text>
        );
      })}
      {/* Cohort peer dots */}
      {PEER_DOTS.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="5" fill="#C7CDD6" />
      ))}
      {/* Hybrid operator dots */}
      {HYBRID_DOTS.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="6" fill="#0F1F3F" stroke="#FFFFFF" strokeWidth="1.5" />
      ))}
      {/* Operator-of-record */}
      <g>
        <circle
          cx={OP_POSITION[activeKey].x}
          cy={OP_POSITION[activeKey].y}
          r="28"
          fill="#D97834"
          opacity="0.16"
        />
        <circle
          cx={OP_POSITION[activeKey].x}
          cy={OP_POSITION[activeKey].y}
          r="12"
          fill="#D97834"
          stroke="#FFFFFF"
          strokeWidth="3"
        />
        {operatorName && (
          <text
            x={OP_POSITION[activeKey].x}
            y={OP_POSITION[activeKey].y + 50}
            textAnchor="middle"
            fill="#0F1F3F"
            fontSize="13"
            fontWeight="700"
          >
            {operatorName}
            {hybrid ? " (hybrid)" : ""}
          </text>
        )}
        {operatorDetail && (
          <text
            x={OP_POSITION[activeKey].x}
            y={OP_POSITION[activeKey].y + 66}
            textAnchor="middle"
            fill="#5C6573"
            fontSize="11"
          >
            {operatorDetail}
          </text>
        )}
      </g>
    </svg>
  );
}
