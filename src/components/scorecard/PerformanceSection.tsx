import { SectionHead } from "./SectionHead";
import { PerformanceRankChart } from "./PerformanceRankChart";
import { fmtDays, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function fasterClass(
  pmValue: number | null,
  marketValue: number | null
): string {
  if (pmValue === null || marketValue === null) return "";
  return pmValue <= marketValue ? "dq-val-good" : "dq-val-bad";
}

export function PerformanceSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const p = scorecard.performance;
  const { rank } = scorecard;
  const domPercentile = rank.percentiles.dom;

  return (
    <section id="performance" className="dq-section">
      <SectionHead
        num="04"
        title="Operating performance — days on market"
        lede={`Ranking of ${scorecard.pm.name} against the ${rank.overallTotal} eligible cohort peers in the ${scorecard.market.fullName.split(",")[0]} MSA, by T12 median days on market. Composite weight 30%.`}
      />

      <PerformanceRankChart scorecard={scorecard} />

      <div className="mt-9 mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-navy">
        Days on market — detail
      </div>
      <table className="dq-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">Operator</th>
            <th className="num">Peer quadrant median</th>
            <th className="num">MSA market median</th>
          </tr>
        </thead>
        <tbody>
          <tr className="row-group">
            <td colSpan={4}>DOM, T12 — by asset class</td>
          </tr>
          <tr>
            <td>Overall</td>
            <td className="num">
              <span className={fasterClass(p.domT12, p.marketDomT12)}>
                {fmtDays(p.domT12)}
              </span>
            </td>
            <td className="num">{fmtDays(p.peerQuadrantDomT12)}</td>
            <td className="num">{fmtDays(p.marketDomT12)}</td>
          </tr>
          <tr>
            <td>
              Apartments
              {!p.aptEligible && (
                <span className="ml-2 text-muted-foreground">
                  (insufficient n)
                </span>
              )}
            </td>
            <td className="num">
              <span className={fasterClass(p.aptDomT12, p.marketDomT12)}>
                {fmtDays(p.aptDomT12)}
              </span>
            </td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>
          <tr>
            <td>
              Houses
              {!p.houseEligible && (
                <span className="ml-2 text-muted-foreground">
                  (insufficient n)
                </span>
              )}
            </td>
            <td className="num">
              <span className={fasterClass(p.houseDomT12, p.marketDomT12)}>
                {fmtDays(p.houseDomT12)}
              </span>
            </td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>

          <tr className="row-group">
            <td colSpan={4}>DOM, lifetime</td>
          </tr>
          <tr>
            <td>Overall</td>
            <td className="num">
              <span className={fasterClass(p.domLifetime, p.marketDomLifetime)}>
                {fmtDays(p.domLifetime)}
              </span>
            </td>
            <td className="num">{fmtDays(p.peerQuadrantDomLifetime)}</td>
            <td className="num">{fmtDays(p.marketDomLifetime)}</td>
          </tr>

          <tr className="row-group">
            <td colSpan={4}>Ranking</td>
          </tr>
          <tr>
            <td>Overall rank</td>
            <td className="num">
              <strong>
                {rank.overall} / {rank.overallTotal}
              </strong>
            </td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>
          <tr>
            <td>Within-quadrant rank</td>
            <td className="num">
              <strong>
                {rank.quadrant ?? "—"} / {rank.quadrantTotal}
              </strong>
            </td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>
          <tr>
            <td>DOM MSA cohort percentile</td>
            <td className="num">
              <strong>
                {domPercentile !== null ? domPercentile.toFixed(1) : "—"}
              </strong>
            </td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>
          <tr>
            <td>T12 sample size</td>
            <td className="num">{fmtInt(p.domT12N)} listings</td>
            <td className="num text-muted-foreground">—</td>
            <td className="num text-muted-foreground">—</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
