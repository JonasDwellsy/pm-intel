import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function deltaPct(pm: number, peer: number): { text: string; tone: string } {
  if (peer === 0) return { text: "—", tone: "" };
  const pct = ((pm - peer) / peer) * 100;
  if (Math.abs(pct) < 1) return { text: "at par", tone: "text-muted-foreground" };
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(0)}%`,
    tone: pct >= 0 ? "dq-val-good" : "dq-val-bad",
  };
}

export function ListingQualitySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const m = scorecard.marketing;
  const completenessΔ = deltaPct(m.completeness, m.peerCompleteness);
  const amenitiesΔ = deltaPct(m.amenitiesMentioned, m.peerAmenities);
  const descLenΔ = deltaPct(m.descLen, m.peerDescLen);

  return (
    <section id="listing-quality" className="dq-section">
      <SectionHead
        num="08"
        title="Listing quality"
        lede="A coarse proxy for marketing discipline. Higher completeness and richer descriptions correlate with faster lease-up."
      />

      <table className="dq-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">Operator</th>
            <th className="num">Peer quadrant median</th>
            <th className="num">Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Completeness score{" "}
              <span className="text-muted-foreground">(0–5)</span>
            </td>
            <td className="num">
              <span
                className={
                  m.completeness >= m.peerCompleteness ? "dq-val-good" : ""
                }
              >
                {fmtNumber(m.completeness, 2)}
              </span>
            </td>
            <td className="num">{fmtNumber(m.peerCompleteness, 2)}</td>
            <td className="num">
              <span className={completenessΔ.tone}>{completenessΔ.text}</span>
            </td>
          </tr>
          <tr>
            <td>
              Amenities mentioned{" "}
              <span className="text-muted-foreground">(avg per listing)</span>
            </td>
            <td className="num">{fmtNumber(m.amenitiesMentioned, 1)}</td>
            <td className="num">{fmtNumber(m.peerAmenities, 1)}</td>
            <td className="num">
              <span className={amenitiesΔ.tone}>{amenitiesΔ.text}</span>
            </td>
          </tr>
          <tr>
            <td>
              Description length{" "}
              <span className="text-muted-foreground">(median chars)</span>
            </td>
            <td className="num">{fmtInt(m.descLen)}</td>
            <td className="num">{fmtInt(m.peerDescLen)}</td>
            <td className="num">
              <span className={descLenΔ.tone}>{descLenΔ.text}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
