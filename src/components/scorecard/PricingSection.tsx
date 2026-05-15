import { SectionHead } from "./SectionHead";
import { fmtPct } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function valTone(favorable: boolean): string {
  return favorable ? "dq-val-good" : "";
}

export function PricingSection({ scorecard }: { scorecard: ScorecardData }) {
  const p = scorecard.pricing;
  return (
    <section id="pricing" className="dq-section">
      <SectionHead
        num="07"
        title="Pricing posture & concession use"
        lede={`How aggressively ${scorecard.pm.name} is priced relative to the ${scorecard.market.name} market, and how often concessions are deployed to close.`}
      />

      <table className="dq-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th className="num">Operator</th>
            <th className="num">Market</th>
            <th>Read</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Median rent vs. comparable units</td>
            <td className="num">
              <span className={valTone(p.t12MedianPremium >= 0)}>
                {fmtPct(p.t12MedianPremium, 1, true)}
              </span>
            </td>
            <td className="num">0.0%</td>
            <td>
              <span className="text-muted-foreground">
                {p.t12MedianPremium > 1
                  ? "premium pricing"
                  : p.t12MedianPremium < -1
                    ? "discount pricing"
                    : "at market"}
              </span>
            </td>
          </tr>
          <tr>
            <td>% of listings priced ≥10% above comp</td>
            <td className="num">{fmtPct(p.t12PctAbove10)}</td>
            <td className="num">
              <span className="text-muted-foreground">—</span>
            </td>
            <td>
              <span className="text-muted-foreground">
                {p.t12PctAbove10 > 20
                  ? "elevated"
                  : p.t12PctAbove10 > 10
                    ? "typical"
                    : "rare"}
              </span>
            </td>
          </tr>
          <tr>
            <td>% of listings priced ≥10% below comp</td>
            <td className="num">
              <span className={valTone(p.t12PctBelow10 < 5)}>
                {fmtPct(p.t12PctBelow10)}
              </span>
            </td>
            <td className="num">
              <span className="text-muted-foreground">—</span>
            </td>
            <td>
              <span className="text-muted-foreground">
                {p.t12PctBelow10 < 1
                  ? "very rare"
                  : p.t12PctBelow10 < 5
                    ? "rare"
                    : p.t12PctBelow10 < 15
                      ? "typical"
                      : "common"}
              </span>
            </td>
          </tr>
          <tr>
            <td>Listings mentioning concessions</td>
            <td className="num">
              <span className={valTone(p.t12ConcessionRate < p.marketConcessionT12)}>
                {fmtPct(p.t12ConcessionRate)}
              </span>
            </td>
            <td className="num">{fmtPct(p.marketConcessionT12)}</td>
            <td>
              <span className="text-muted-foreground">
                {p.t12ConcessionRate === 0
                  ? "no use observed"
                  : p.t12ConcessionRate < p.marketConcessionT12
                    ? "below market"
                    : "at or above market"}
              </span>
            </td>
          </tr>
          <tr>
            <td>Concession use, multiple of market</td>
            <td className="num">
              <span
                className={valTone(
                  p.marketConcessionT12 > 0 &&
                    p.t12ConcessionRate / p.marketConcessionT12 < 1
                )}
              >
                {p.marketConcessionT12 > 0
                  ? `${(p.t12ConcessionRate / p.marketConcessionT12).toFixed(1)}×`
                  : "—"}
              </span>
            </td>
            <td className="num">1.0×</td>
            <td>
              <span className="text-muted-foreground">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
