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

export type QuadrantOperator = {
  name: string;
  sub?: string;
  quadrant: string;
  /** Position offset within the operator's quadrant; 0–1 along each axis. */
  offset?: { x: number; y: number };
  /** Override dot color (defaults: green for MF·Inst, orange for SS·Indep,
   *  teal for SS·Inst, magenta for MF·Indep, slate for hybrid). */
  color?: string;
  hybrid?: boolean;
};

const DEFAULT_OP_COLOR: Record<QuadrantKey, string> = {
  "ss-independent": "#D97834",
  "ss-institutional": "#1B6E8C",
  "mf-independent": "#8B3A62",
  "mf-institutional": "#2F7A5C",
};

// Conceptual variant: static 2×2 text-cell grid used in the methodology page.
// No operator markers, no scatter — just the four quadrant definitions laid
// out as a figure.
const CONCEPTUAL_CELLS: Array<{
  key: QuadrantKey;
  eyebrow: string;
  title: string;
  description: string;
  row: 0 | 1;
  col: 0 | 1;
}> = [
  {
    key: "mf-institutional",
    eyebrow: "Q1 · Institutional MF/BTR",
    title: "Institutional multifamily",
    description:
      "Single-asset whole-property leasing at scale; ≥50-unit buildings or large BTR communities.",
    row: 0,
    col: 0,
  },
  {
    key: "ss-institutional",
    eyebrow: "Q2 · Institutional scattered",
    title: "Institutional scattered site",
    description:
      "Geographically distributed SFR / small-MF books large enough to operate at institutional scale (~1,000+ units).",
    row: 0,
    col: 1,
  },
  {
    key: "mf-independent",
    eyebrow: "Q3 · Independent MF/BTR",
    title: "Independent multifamily",
    description:
      "Owner-operator multifamily; smaller buildings, lighter org overhead, often family- or partnership-owned.",
    row: 1,
    col: 0,
  },
  {
    key: "ss-independent",
    eyebrow: "Q4 · Independent scattered",
    title: "Independent scattered site",
    description:
      "Owner-operator scattered books; typical SFR property manager working a single MSA.",
    row: 1,
    col: 1,
  },
];

export function QuadrantGrid({
  quadrant,
  hybrid = false,
  variant = "full",
  operatorName,
  operatorDetail,
  operators,
}: {
  quadrant: string;
  hybrid?: boolean;
  variant?: "full" | "compact" | "conceptual";
  operatorName?: string;
  operatorDetail?: string;
  /** When provided alongside variant="compact", renders the hero-style
   *  multi-operator quadrant (axis-labelled, ~380×360 viewBox) instead of
   *  the single-dot mini version. */
  operators?: QuadrantOperator[];
}) {
  // --- Conceptual variant: 2×2 text-cell grid for the methodology page ---
  if (variant === "conceptual") {
    // Layout: 28px-wide operating-axis lane on the left (flex sibling, full
    // height) + a self-contained 2×2 data grid on the right that auto-sizes
    // its rows to cell content. Keeping the lane outside the data grid means
    // the rotated text can't inflate the cell rows.
    const cellClasses = (col: 0 | 1, row: 0 | 1) =>
      [
        "bg-white p-5",
        col === 0 ? "border-r border-grid" : "",
        row === 0 ? "border-b border-grid" : "",
      ]
        .filter(Boolean)
        .join(" ");

    return (
      <figure
        aria-label="Four operator quadrants — conceptual"
        className="not-prose my-2 overflow-hidden rounded-md border border-grid"
      >
        <div className="flex">
          {/* Operating-axis lane (flex sibling, full container height) */}
          <div className="flex w-7 shrink-0 items-center justify-center border-r border-grid bg-surface-soft">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              Operating axis
            </span>
          </div>

          {/* Data column: top axis labels + 2×2 cells + bottom axis label */}
          <div className="flex flex-1 flex-col">
            {/* Top axis labels — 28px tall */}
            <div className="grid h-7 grid-cols-2 border-b border-grid bg-surface-soft">
              <div className="flex items-center border-r border-grid px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                MF / BTR
              </div>
              <div className="flex items-center px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Scattered site
              </div>
            </div>

            {/* 2×2 data cells — auto-sized to content */}
            <div className="grid flex-1 grid-cols-2">
              {CONCEPTUAL_CELLS.map((c) => (
                <div key={c.key} className={cellClasses(c.col, c.row)}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
                    {c.eyebrow}
                  </p>
                  <p className="mt-2 text-[15px] font-bold text-navy">
                    {c.title}
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Bottom axis label — 28px tall, centered */}
            <div className="flex h-7 items-center justify-center border-t border-grid bg-surface-soft text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Asset class
            </div>
          </div>
        </div>
      </figure>
    );
  }

  const activeKey = classify(quadrant);

  // --- Hero variant: multi-operator labelled compact quadrant ---
  if (variant === "compact" && operators && operators.length > 0) {
    // 380×360 viewBox. Frame at (60,40) → 290 wide × 270 tall.
    const FRAME = { x: 60, y: 40, w: 290, h: 270 };
    const cx = FRAME.x + FRAME.w / 2; // 205
    const cy = FRAME.y + FRAME.h / 2; // 175

    // Map an operator quadrant + 0–1 offset → SVG position within that quadrant.
    function placeOperator(op: QuadrantOperator) {
      const key = classify(op.quadrant);
      const offset = op.offset ?? { x: 0.5, y: 0.5 };
      const halfW = FRAME.w / 2;
      const halfH = FRAME.h / 2;
      const isRight = key === "mf-independent" || key === "mf-institutional";
      const isBottom = key === "ss-institutional" || key === "mf-institutional";
      const x = FRAME.x + (isRight ? halfW : 0) + offset.x * halfW;
      const y = FRAME.y + (isBottom ? halfH : 0) + offset.y * halfH;
      return {
        x,
        y,
        color: op.color ?? DEFAULT_OP_COLOR[key],
        labelAnchor: isRight ? "end" : "start",
      } as const;
    }

    return (
      <svg
        viewBox="0 0 380 360"
        className="block h-auto w-full"
        role="img"
        aria-label="Operator-type quadrant"
      >
        {/* Frame background */}
        <rect
          x={FRAME.x}
          y={FRAME.y}
          width={FRAME.w}
          height={FRAME.h}
          fill="#FBFAF6"
          stroke="#E6E2D6"
          strokeWidth={1}
        />
        {/* Subtle tint of the operator-of-record quadrant (bottom-right MF·Inst) */}
        <rect
          x={cx}
          y={cy}
          width={FRAME.w / 2}
          height={FRAME.h / 2}
          fill="rgba(47,122,92,0.06)"
        />
        {/* Dot-pattern texture: a sparse grid of soft beige dots */}
        <g opacity="0.6" fill="#D9D4C3">
          {Array.from({ length: 6 }, (_, row) =>
            Array.from({ length: 6 }, (_, col) => {
              const x = FRAME.x + 24 + col * 48;
              const y = FRAME.y + 24 + row * 44;
              return <circle key={`${row}-${col}`} cx={x} cy={y} r={0.7} />;
            })
          )}
        </g>
        {/* Crosshair */}
        <line x1={cx} y1={FRAME.y} x2={cx} y2={FRAME.y + FRAME.h} stroke="#C7C1AE" strokeWidth={1} />
        <line x1={FRAME.x} y1={cy} x2={FRAME.x + FRAME.w} y2={cy} stroke="#C7C1AE" strokeWidth={1} />

        {/* Axis labels — Inter, uppercase, tracking 0.2em */}
        <text x={cx} y={FRAME.y - 12} textAnchor="middle" fill="#6E7990"
          fontSize="9" fontWeight="600" letterSpacing="2"
          style={{ textTransform: "uppercase" }}>
          Independent  ·  Institutional
        </text>
        <text x={FRAME.x - 10} y={cy + 3} textAnchor="end" fill="#6E7990"
          fontSize="9" fontWeight="600" letterSpacing="2"
          style={{ textTransform: "uppercase" }}>
          Scattered
        </text>
        <text x={FRAME.x + FRAME.w + 10} y={cy + 3} textAnchor="start" fill="#6E7990"
          fontSize="9" fontWeight="600" letterSpacing="2"
          style={{ textTransform: "uppercase" }}>
          MF / BTR
        </text>

        {/* Operator dots + labels */}
        {operators.map((op) => {
          const place = placeOperator(op);
          // Label position: label sits adjacent to the dot, anchored toward the
          // closer axis edge (start on left-half quadrants, end on right-half).
          const labelDx = place.labelAnchor === "end" ? -14 : 14;
          return (
            <g key={op.name}>
              {/* Halo */}
              <circle
                cx={place.x}
                cy={place.y}
                r={14}
                fill={place.color}
                opacity={0.22}
              />
              {/* Solid dot */}
              <circle
                cx={place.x}
                cy={place.y}
                r={6.5}
                fill={place.color}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              {/* Name label */}
              <text
                x={place.x + labelDx}
                y={place.y - 2}
                textAnchor={place.labelAnchor}
                fill="#0F1F3F"
                fontSize="11"
                fontWeight={700}
              >
                {op.name}
                {op.hybrid && (
                  <tspan
                    dx="6"
                    fill="#1B6E8C"
                    fontSize="8.5"
                    fontWeight={700}
                    letterSpacing="0.5"
                    style={{ textTransform: "uppercase" }}
                  >
                    HYBRID
                  </tspan>
                )}
              </text>
              {op.sub && (
                <text
                  x={place.x + labelDx}
                  y={place.y + 12}
                  textAnchor={place.labelAnchor}
                  fill="#6E7990"
                  fontSize="9.5"
                  fontWeight={500}
                >
                  {op.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  // --- Default compact: single mini dot, used inline elsewhere ---
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
