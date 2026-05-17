import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { CommunityVisibilityBlock, ScorecardData } from "@/lib/types";

// 3-state visibility scale (Partial / Likely partial / Comprehensive). Drops
// the 4-state taxonomy and navy "Above expected" chip from v0.3.4 — under the
// v0.6.1 formula the ceiling is meaningful signal, not anomaly.
function VisibilityScale({
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
  // Top of the visible range is 2.5× — comfortable above the 1.0 cohort norm
  // for the genuinely-transparent operators (UDR-class) that v0.6.1 surfaces.
  const minR = 0;
  const maxR = 2.5;
  const xOf = (r: number) =>
    padL +
    ((Math.max(minR, Math.min(maxR, r)) - minR) / (maxR - minR)) *
      (W - padL - padR);

  const zones = [
    { from: 0, to: 0.5, fill: "#F1D8D3", label: "Partial visibility" },
    { from: 0.5, to: 0.8, fill: "#F9E5CC", label: "Likely partial" },
    { from: 0.8, to: 2.5, fill: "#D9E7CE", label: "Comprehensive" },
  ];
  const ticks = [
    { v: 0, label: "0×" },
    { v: 0.5, label: "0.5×" },
    { v: 0.8, label: "0.8×" },
    { v: 1.0, label: "1.0×", emphasis: true },
    { v: 1.5, label: "1.5×" },
    { v: 2.5, label: "2.5×" },
  ];

  const pinX = xOf(ratio);

  return (
    <div className="rounded-lg border border-grid bg-white p-7">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        aria-label={`Community visibility ratio ${ratio.toFixed(2)}×`}
      >
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
        <rect
          x={padL}
          y={scaleY}
          width={W - padL - padR}
          height={scaleH}
          fill="none"
          stroke="#D5DBE3"
        />
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
                fontFamily="var(--font-mono), monospace"
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
                  cohort norm
                </text>
              )}
            </g>
          );
        })}
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

// Section is suppressed entirely when the operator doesn't qualify under the
// v0.6.1 scope gate (Scattered operators, Hybrid below the gate, MF/BTR under
// the 12-month tenure gate). The seed normalizer surfaces null in that case.
export function CommunityVisibilitySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const cv: CommunityVisibilityBlock | null = scorecard.communityVisibility;
  if (!cv) return null;

  const turnoverPct = Math.round(cv.expectedTurnoverRate * 100);
  const sumExpected = cv.perCommunity.reduce(
    (a, c) => a + c.expectedListings,
    0
  );
  const sumActual = cv.perCommunity.reduce((a, c) => a + c.actualListings, 0);

  return (
    <section id="community-visibility" className="dq-section">
      <SectionHead
        num="08"
        title="Community visibility"
        lede={`Whether ${scorecard.pm.name} is showing Dwellsy a substantial share of the units in the communities they manage. Computed only for MF/BTR operators with substantial community concentration and ≥12 months of observation history.`}
      />

      <VisibilityScale ratio={cv.ratio} operatorLabel={scorecard.pm.name} />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span
          className={
            "dq-chip" +
            (cv.chipClass === "dq-chip-orange" ? " dq-chip-orange" : "")
          }
        >
          {cv.stateLabel}
        </span>
        <span className="text-[13px] text-muted-foreground">
          Visibility ratio{" "}
          <strong className="dq-mono dq-tnum text-navy">
            {cv.ratio.toFixed(2)}×
          </strong>{" "}
          · cohort norm <strong className="dq-mono text-navy">1.00×</strong> ·
          assumed turnover{" "}
          <strong className="dq-mono dq-tnum text-navy">{turnoverPct}%</strong>{" "}
          / yr
        </span>
      </div>

      {cv.perCommunity.length > 0 && (
        <table className="dq-table mt-7">
          <thead>
            <tr>
              <th>Community</th>
              <th className="num">True community size</th>
              <th className="num">Expected T12 listings</th>
              <th className="num">Actual T12 listings</th>
              <th className="num">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {cv.perCommunity.map((c) => {
              const coverage =
                c.expectedListings > 0
                  ? c.actualListings / c.expectedListings
                  : 0;
              return (
                <tr key={String(c.communityId)}>
                  <td className="dq-mono text-muted-foreground">
                    #{String(c.communityId)}
                  </td>
                  <td className="num">{fmtInt(c.knownSize)} units</td>
                  <td className="num">{fmtNumber(c.expectedListings, 1)}</td>
                  <td className="num">{fmtInt(c.actualListings)}</td>
                  <td className="num">
                    <strong>{fmtNumber(coverage, 2)}×</strong>
                  </td>
                </tr>
              );
            })}
            <tr className="tr-total">
              <td>
                <strong>
                  Total · {cv.perCommunity.length} communit
                  {cv.perCommunity.length === 1 ? "y" : "ies"}
                </strong>
              </td>
              <td className="num">—</td>
              <td className="num">
                <strong>{fmtNumber(sumExpected, 1)}</strong>
              </td>
              <td className="num">
                <strong>{fmtInt(sumActual)}</strong>
              </td>
              <td className="num">
                <strong>{cv.ratio.toFixed(2)}×</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="dq-rationale">
        <p className="dq-rationale-label">How to read this</p>
        <p>
          The denominator is the community&apos;s true unit count from
          Dwellsy&apos;s structural data, multiplied by an assumed{" "}
          {turnoverPct}% annual turnover rate (the empirical cross-market norm
          under v0.6.1). A ratio at or above{" "}
          <span className="dq-mono">1.00×</span> means {scorecard.pm.name} is
          listing at least the turnover-implied share of their managed
          communities — the credibility-positive signal that the operator is
          comprehensively visible. Below{" "}
          <span className="dq-mono">0.80×</span> flags reduced visibility
          relative to community structure.
        </p>
      </div>
    </section>
  );
}
