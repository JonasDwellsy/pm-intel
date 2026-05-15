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
  const detailParts: string[] = [
    `${fmtInt(scorecard.coverage.totalObservedUnits)} units`,
    `${fmtInt(
      scorecard.coverage.institutionalBuildings + scorecard.coverage.smallMfBuildings
    )} buildings`,
    `${scorecard.selectionBias.ratio.toFixed(2)}× intensity`,
  ];

  return (
    <section id="why-this-quadrant" className="dq-section">
      <SectionHead
        num="11"
        title="Why this quadrant"
        lede="Operator classification reflects observed unit composition and operating axis on asset class, not self-reported business model."
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
