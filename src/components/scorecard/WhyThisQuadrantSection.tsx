import { SectionHead } from "./SectionHead";
import { QuadrantGrid } from "./QuadrantGrid";
import { dqChartTheme } from "@/lib/chart-theme";
import { fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

export function WhyThisQuadrantSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const c = scorecard.coverage;

  // v0.6.1 drops the institutional/small-mf/sfr breakdown and the selection
  // bias intensity ratio. We surface the units summary the v0.6.1 data does
  // carry: total managed units, national T12 footprint (for the multi-market
  // institutional classification), and concentrated-community share.
  const detailParts: string[] = [
    `${fmtInt(c.totalObservedUnits)} units in ${scorecard.market.name}`,
  ];
  if (c.nationalObservedUnitsT12 !== null) {
    detailParts.push(`${fmtInt(c.nationalObservedUnitsT12)} units nationally`);
  }
  if (c.concentratedShare !== null) {
    detailParts.push(
      `${Math.round(c.concentratedShare * 100)}% in concentrated communities`
    );
  }

  return (
    <section id="why-this-quadrant" className="dq-section">
      <SectionHead
        num="10"
        title="Why this quadrant"
        lede="Operator classification reflects observed community-level concentration and cross-market scale, not self-reported business model."
      />

      <div className="dq-chart-card">
        <div className="dq-chart-head">
          <div>
            <p className="dq-chart-title">
              Classification map · {scorecard.market.name} MSA
            </p>
            <p className="dq-chart-sub">
              Operator-of-record in orange · hybrid operators in navy · cohort
              in grey
            </p>
          </div>
          <div className="dq-chart-legend">
            <span>
              <span
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.accent }}
              />
              {scorecard.pm.name}
            </span>
            <span>
              <span
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.primary }}
              />
              Hybrid
            </span>
            <span>
              <span
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.cohort }}
              />
              Cohort
            </span>
          </div>
        </div>
        <QuadrantGrid
          quadrant={scorecard.pm.quadrant}
          hybrid={scorecard.pm.hybrid}
          operatorName={scorecard.pm.name}
          operatorDetail={detailParts.join(" · ")}
        />
      </div>

      <div className="dq-rationale">
        <p className="dq-rationale-label">Classification rationale</p>
        <p>{scorecard.classificationRationale}</p>
      </div>
    </section>
  );
}
