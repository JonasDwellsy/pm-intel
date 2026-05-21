// Big classification quadrant — 2×2 scatter with operator-of-record callout.
// Peer positions are synthesized deterministically from the quadrant index so
// the visual is stable per quadrant but readable as "cohort scatter".

import { QUADRANT7_COLORS, type Quadrant7CellKey } from "@/lib/quadrant7-colors";

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
  { key: "ss-independent", label: "Scattered · Independent", x: 40, y: 40, anchor: "start" },
  { key: "mf-independent", label: "MF / BTR · Independent", x: 840, y: 40, anchor: "end" },
  { key: "ss-institutional", label: "Scattered · Institutional", x: 40, y: 540, anchor: "start" },
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

// Conceptual variant: 7-cell taxonomy text grid used in the methodology page.
// 3 type-axis rows (SFR / Small MF/BTR / Large MF/BTR) × 2 scale-axis cols
// (Independent / Institutional) = 6 cells, plus Hybrid as a 7th callout row
// since Hybrid carries no scale split (Section 03 of methodology). Sample
// operator names per cell are sourced from the v0.6.2 seed — top 3 by
// observed unit count in the cell (excludes Hybrid which has no scale split).
type ConceptualCell = {
  key: Quadrant7CellKey;
  rowEyebrow: string;
  scaleEyebrow: string;
  title: string;
  description: string;
  samples: string[];
};

const CONCEPTUAL_7CELL_ROWS: Array<{
  rowLabel: string;
  cells: [ConceptualCell, ConceptualCell];
}> = [
  {
    rowLabel: "SFR (Scattered)",
    cells: [
      {
        key: "sfr-ind",
        rowEyebrow: "SFR",
        scaleEyebrow: "Independent",
        title: "SFR Independent",
        description:
          "Owner-operator scattered SFR books. Typical local property manager working a single MSA with concentrated share under 30%.",
        samples: ["Ampere PM", "Doorby PM", "HomeRiver Group"],
      },
      {
        key: "sfr-inst",
        rowEyebrow: "SFR",
        scaleEyebrow: "Institutional",
        title: "SFR Institutional",
        description:
          "Geographically distributed SFR books large enough to operate at institutional scale (500+ urus across all Dwellsy IQ markets).",
        samples: ["Progress Residential", "Tricon Residential", "Invitation Homes"],
      },
    ],
  },
  {
    rowLabel: "Small MF/BTR",
    cells: [
      {
        key: "small-mfbtr-ind",
        rowEyebrow: "Small MF/BTR",
        scaleEyebrow: "Independent",
        title: "Small MF/BTR Independent",
        description:
          "Owner-operator concentrated portfolios with median community size 10–49 units. Often family- or partnership-owned walk-ups.",
        samples: ["WRH Realty Services", "Duke Properties", "Schweb Partners"],
      },
      {
        key: "small-mfbtr-inst",
        rowEyebrow: "Small MF/BTR",
        scaleEyebrow: "Institutional",
        title: "Small MF/BTR Institutional",
        description:
          "Smaller MF/BTR portfolios that meet the 500-uru cross-market scale threshold. Rare cell — fewer than 5 operators in the v0.6.2 footprint.",
        samples: ["ResProp", "Asset Living", "Optivo Group"],
      },
    ],
  },
  {
    rowLabel: "Large MF/BTR",
    cells: [
      {
        key: "large-mfbtr-ind",
        rowEyebrow: "Large MF/BTR",
        scaleEyebrow: "Independent",
        title: "Large MF/BTR Independent",
        description:
          "Owner-operator multifamily with median community size 50+ units. Concentrated share above 70% but cross-market scale below 500 urus.",
        samples: ["Brookside Properties", "ARIUM Living", "Link Real Estate Group"],
      },
      {
        key: "large-mfbtr-inst",
        rowEyebrow: "Large MF/BTR",
        scaleEyebrow: "Institutional",
        title: "Large MF/BTR Institutional",
        description:
          "200+ unit communities operated at national scale. Carries the largest absolute urus per operator across the 7-cell taxonomy.",
        samples: ["Mission Rock Residential", "Bridge Property Management", "LVL Living"],
      },
    ],
  },
];

const CONCEPTUAL_HYBRID: ConceptualCell = {
  key: "hybrid",
  rowEyebrow: "Hybrid",
  scaleEyebrow: "No scale split",
  title: "Hybrid operator",
  description:
    "Mixed portfolios with concentrated share between 30% and 70%. Hybrid is its own classification — there is no Independent / Institutional split for Hybrid operators.",
  samples: ["Austell Village", "Generation PM", "H&H Property Management"],
};

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
  // --- Conceptual variant: 7-cell text grid for the methodology page §03 ---
  // Layout (desktop ≥ md): 3-row × 2-col grid for the 6 type×scale cells,
  // followed by a full-width Hybrid callout that visually breaks the grid
  // (because Hybrid carries no scale split). The left rail labels the type
  // axis (SFR / Small / Large) and the top rail labels the scale axis
  // (Independent / Institutional). Mobile (< md): the rails collapse and
  // every cell stacks single-column with its eyebrow tag carrying the axis
  // label inline so the structural meaning survives the linearization.
  if (variant === "conceptual") {
    return (
      <figure
        aria-label="Seven-cell operator taxonomy — conceptual figure"
        className="not-prose my-2 overflow-hidden rounded-md border border-grid bg-white"
      >
        {/* Desktop grid (md+) — 3 rows × 2 cols with axis rails */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
            {/* Header row: corner spacer + 2 scale-axis labels */}
            <div className="border-b border-r border-grid bg-surface-soft" />
            <div className="border-b border-r border-grid bg-surface-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Independent
            </div>
            <div className="border-b border-grid bg-surface-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Institutional
            </div>

            {CONCEPTUAL_7CELL_ROWS.map((row, rowIdx) => {
              const isLastRow = rowIdx === CONCEPTUAL_7CELL_ROWS.length - 1;
              return (
                <div key={row.rowLabel} className="contents">
                  {/* Row label cell */}
                  <div
                    className={`border-r border-grid bg-surface-soft px-3 py-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${
                      isLastRow ? "" : "border-b"
                    }`}
                  >
                    {row.rowLabel}
                  </div>
                  {row.cells.map((cell, cellIdx) => {
                    const color = QUADRANT7_COLORS[cell.key];
                    const isLastCol = cellIdx === row.cells.length - 1;
                    return (
                      <Quadrant7Cell
                        key={cell.key}
                        cell={cell}
                        color={color}
                        className={`p-5 ${isLastCol ? "" : "border-r border-grid"} ${
                          isLastRow ? "" : "border-b border-grid"
                        }`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Hybrid callout — full width, visually distinct */}
          <div className="border-t border-grid bg-surface-soft px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Hybrid (no scale split)
          </div>
          <Quadrant7Cell
            cell={CONCEPTUAL_HYBRID}
            color={QUADRANT7_COLORS.hybrid}
            className="p-5"
          />
        </div>

        {/* Mobile stack (< md) — single column, every cell carries its axis
            label inline so the taxonomy structure remains legible without
            the row/col rails */}
        <div className="flex flex-col md:hidden">
          {CONCEPTUAL_7CELL_ROWS.flatMap((row) =>
            row.cells.map((cell, idx) => ({ cell, isLast: false, idx }))
          ).map(({ cell }, i, arr) => (
            <div
              key={cell.key}
              className={`${i < arr.length - 1 ? "border-b border-grid" : ""} p-5`}
            >
              <Quadrant7Cell
                cell={cell}
                color={QUADRANT7_COLORS[cell.key]}
                showAxisInline
              />
            </div>
          ))}
          <div className="border-t border-grid bg-surface-soft p-5">
            <Quadrant7Cell
              cell={CONCEPTUAL_HYBRID}
              color={QUADRANT7_COLORS.hybrid}
              showAxisInline
            />
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

        {/* Operator dots + labels. PR #46 fixes the prior label
            collision: the operator NAME stays anchored to one side
            of the dot (which keeps the name visually associated
            with it), but the SUB-LABEL ("Nashville · ~2,400 units")
            sits BELOW the dot with textAnchor=middle. Centering the
            sub under its own dot prevents the previous left/right
            anchor from extending two sub-labels horizontally toward
            each other across the chart. */}
        {operators.map((op) => {
          const place = placeOperator(op);
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
              {/* Name label — anchored next to the dot */}
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
              {/* Sub-label — centered under the dot */}
              {op.sub && (
                <text
                  x={place.x}
                  y={place.y + 22}
                  textAnchor="middle"
                  fill="#6E7990"
                  fontSize="9"
                  fontWeight={500}
                >
                  {op.sub}
                </text>
              )}
            </g>
          );
        })}

        {/* v0.8 7-cell footnote — sits below the chart frame
            (frame ends at y=310; viewBox runs to y=360). PR #46
            spec calls for this when we keep the 4-quadrant
            visualization but reference the 7-cell taxonomy that
            extends it. */}
        <text
          x={FRAME.x + FRAME.w / 2}
          y={FRAME.y + FRAME.h + 28}
          textAnchor="middle"
          fill="#6E7990"
          fontSize="8.5"
          fontWeight={500}
          fontStyle="italic"
        >
          v0.8 methodology further subdivides MF/BTR by community size
          into a 7-cell taxonomy.
        </text>
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

// Inner cell renderer for the 7-cell conceptual figure. Renders a left-edge
// color bar in the cell's quadrant color, title, descriptor prose, and a
// "Sample operators" list. `showAxisInline` is set on the mobile-stack path
// to surface the type × scale axis labels (which the desktop rails carry).
function Quadrant7Cell({
  cell,
  color,
  className,
  showAxisInline,
}: {
  cell: {
    rowEyebrow: string;
    scaleEyebrow: string;
    title: string;
    description: string;
    samples: string[];
  };
  color: { fg: string; soft: string; border: string };
  className?: string;
  showAxisInline?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        // Left accent bar tinted with the cell's quadrant color. Subtle —
        // the figure is informational, not loud — but enough to make the
        // 6+1 cells read as distinct color-coded zones at a glance.
        boxShadow: `inset 4px 0 0 0 ${color.fg}`,
      }}
    >
      {showAxisInline && (
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: color.fg }}
        >
          {cell.rowEyebrow} · {cell.scaleEyebrow}
        </p>
      )}
      <p
        className="text-[15px] font-bold text-navy"
        style={{ marginTop: showAxisInline ? "0.5rem" : 0 }}
      >
        {cell.title}
      </p>
      <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
        {cell.description}
      </p>
      {cell.samples.length > 0 && (
        <p className="mt-3 text-[11.5px] text-muted-2">
          <span className="font-semibold uppercase tracking-[0.12em]">
            Sample operators
          </span>{" "}
          · {cell.samples.join(", ")}
        </p>
      )}
    </div>
  );
}
