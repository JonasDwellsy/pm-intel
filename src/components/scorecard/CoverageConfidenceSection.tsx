import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

// Banded confidence scale from 0× to 2.5× with four color zones and an
// operator pin. Pure inline SVG so it renders identically across server +
// client + PDF screenshots.
function ConfidenceScale({
  ratio,
  operatorLabel,
}: {
  ratio: number;
  operatorLabel: string;
}) {
  const W = 880;
  const H = 200;
  const padL = 28;
  const padR = 28;
  const scaleY = 110;
  const scaleH = 30;
  const minR = 0;
  const maxR = 2.5;
  const xOf = (r: number) =>
    padL + ((Math.max(minR, Math.min(maxR, r)) - minR) / (maxR - minR)) * (W - padL - padR);

  const zones = [
    { from: 0, to: 0.5, fill: "#F1D8D3", label: "Partial" },
    { from: 0.5, to: 0.8, fill: "#F9E5CC", label: "Likely partial" },
    { from: 0.8, to: 1.2, fill: "#D9E7CE", label: "Within expected" },
    { from: 1.2, to: 2.5, fill: "#C7DABA", label: "Comprehensive" },
  ];
  const ticks = [
    { v: 0, label: "0×" },
    { v: 0.5, label: "0.5×" },
    { v: 0.8, label: "0.8×" },
    { v: 1.0, label: "1.0×", emphasis: true },
    { v: 1.2, label: "1.2×" },
    { v: 2.5, label: "2.5×" },
  ];

  const pinX = xOf(ratio);

  return (
    <div className="rounded-lg border border-grid bg-white p-7">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        aria-label={`Coverage ratio ${ratio.toFixed(2)}×`}
      >
        {/* Zones */}
        {zones.map((z) => {
          const x0 = xOf(z.from);
          const x1 = xOf(z.to);
          return (
            <g key={z.from}>
              <rect
                x={x0}
                y={scaleY}
                width={x1 - x0}
                height={scaleH}
                fill={z.fill}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
              <text
                x={(x0 + x1) / 2}
                y={scaleY + scaleH / 2 + 3}
                textAnchor="middle"
                fill="#0F1F3F"
                fontSize="11"
                fontWeight="600"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {z.label}
              </text>
            </g>
          );
        })}
        {/* Border around the scale */}
        <rect
          x={padL}
          y={scaleY}
          width={W - padL - padR}
          height={scaleH}
          fill="none"
          stroke="#D5DBE3"
        />
        {/* Ticks */}
        {ticks.map((t) => {
          const x = xOf(t.v);
          return (
            <g key={t.v}>
              <line
                x1={x}
                x2={x}
                y1={scaleY + scaleH}
                y2={scaleY + scaleH + 8}
                stroke={t.emphasis ? "#0F1F3F" : "#5C6573"}
                strokeWidth={t.emphasis ? 1.5 : 1}
              />
              <text
                x={x}
                y={scaleY + scaleH + 24}
                textAnchor="middle"
                fill={t.emphasis ? "#0F1F3F" : "#5C6573"}
                fontSize="11"
                fontWeight={t.emphasis ? 700 : 500}
                fontFamily='var(--font-mono), monospace'
              >
                {t.label}
              </text>
              {t.emphasis && (
                <text
                  x={x}
                  y={scaleY + scaleH + 40}
                  textAnchor="middle"
                  fill="#0F1F3F"
                  fontSize="10"
                  fontWeight={600}
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  expected
                </text>
              )}
            </g>
          );
        })}
        {/* Operator pin (pentagon pointing down) */}
        <g transform={`translate(${pinX}, ${scaleY})`}>
          <polygon
            points="-9,-26 9,-26 9,-10 0,0 -9,-10"
            fill="#D97834"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
          <text
            x="0"
            y="-36"
            textAnchor="middle"
            fill="#0F1F3F"
            fontSize="12"
            fontWeight={700}
          >
            {operatorLabel} · {ratio.toFixed(2)}×
          </text>
        </g>
      </svg>
    </div>
  );
}

export function CoverageConfidenceSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const s = scorecard.selectionBias;
  const ratio = s.ratio;
  const pillVariant =
    ratio >= 0.8 && ratio <= 1.5
      ? "dq-pill-green"
      : ratio > 1.5
        ? "dq-pill-green"
        : ratio >= 0.5
          ? "dq-pill-orange"
          : "dq-pill-rose";
  const assessmentLabel =
    ratio >= 1.2
      ? "Above expected — comprehensive coverage"
      : ratio >= 0.8
        ? "Within expected range"
        : ratio >= 0.5
          ? "Likely partial coverage"
          : "Partial coverage";

  return (
    <section id="coverage-confidence" className="dq-section">
      <SectionHead
        num="09"
        title="Coverage confidence"
        lede="Whether the observed Dwellsy listing volume matches what would be expected for a portfolio of this size and composition. A ratio near 1.0× means we are seeing the full book; below 1.0 means the scorecard may be partial."
      />

      <ConfidenceScale ratio={ratio} operatorLabel={scorecard.pm.name} />

      <table className="dq-table mt-7">
        <thead>
          <tr>
            <th>Signal</th>
            <th className="num">Value</th>
            <th>Read</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Buildings observed</td>
            <td className="num">{fmtInt(s.buildings)}</td>
            <td className="text-muted-foreground">
              Deduplicated building IDs across all listings
            </td>
          </tr>
          <tr>
            <td>
              Observed intensity{" "}
              <span className="text-muted-foreground">(listings ÷ unit ÷ year)</span>
            </td>
            <td className="num">{fmtNumber(s.observed, 2)}</td>
            <td className="text-muted-foreground">
              {scorecard.pm.name} refreshes ~{Math.round(s.observed * 100)}% of inventory annually
            </td>
          </tr>
          <tr>
            <td>Expected intensity</td>
            <td className="num">{fmtNumber(s.expected, 2)}</td>
            <td className="text-muted-foreground">
              Modeled from cohort tenancy &amp; turnover
            </td>
          </tr>
          <tr>
            <td>Ratio</td>
            <td className="num">
              <strong>{fmtNumber(s.ratio, 2)}×</strong>
            </td>
            <td>
              <span className={`dq-pill ${pillVariant}`}>{assessmentLabel}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
