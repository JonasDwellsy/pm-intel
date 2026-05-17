import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

// v0.6.1 marketing block carries three subscores (0–100) + a composite, plus
// the raw underlying values. The composite is the input to the operator's
// percentile rank (15% of the composite). Peer-quadrant medians are no
// longer materialized; we show the absolute subscores and the operator's
// MSA-cohort percentile rank instead.
export function ListingQualitySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const m = scorecard.marketing;
  const marketingPercentile = scorecard.rank.percentiles.marketing;

  return (
    <section id="marketing" className="dq-section">
      <SectionHead
        num="09"
        title="Marketing quality"
        lede="A coarse proxy for operational discipline. Higher completeness and richer descriptions correlate with faster lease-up. Subscores normalize each signal to 0–100; the composite drives the operator's marketing percentile in the composite ranking."
      />

      <table className="dq-table">
        <thead>
          <tr>
            <th>Subscore</th>
            <th className="num">Observed</th>
            <th className="num">Score (0–100)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Completeness{" "}
              <span className="text-muted-foreground">
                (rent, beds, baths, sqft, description, amenities, photo)
              </span>
            </td>
            <td className="num">{fmtNumber(m.completeness, 1)} fields</td>
            <td className="num">
              <strong>{fmtNumber(m.completenessScore, 0)}</strong>
            </td>
          </tr>
          <tr>
            <td>
              Amenities mentioned{" "}
              <span className="text-muted-foreground">(median per listing)</span>
            </td>
            <td className="num">{fmtNumber(m.amenitiesMentioned, 1)}</td>
            <td className="num">
              <strong>{fmtNumber(m.amenitiesScore, 0)}</strong>
            </td>
          </tr>
          <tr>
            <td>
              Description length{" "}
              <span className="text-muted-foreground">(median chars)</span>
            </td>
            <td className="num">{fmtInt(m.descLen)}</td>
            <td className="num">
              <strong>{fmtNumber(m.descScore, 0)}</strong>
            </td>
          </tr>
          <tr className="tr-total">
            <td>
              <strong>Composite marketing score</strong>
            </td>
            <td className="num">—</td>
            <td className="num">
              <strong>{fmtNumber(m.compositeScore, 0)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {marketingPercentile !== null && (
          <span className="dq-pill dq-pill-navy-soft">
            MSA cohort percentile {marketingPercentile.toFixed(0)}
          </span>
        )}
        {m.medianPhotosT12 !== null && (
          <span className="text-[13px] text-muted-foreground">
            Median photos per T12 listing{" "}
            <strong className="dq-mono dq-tnum text-navy">
              {m.medianPhotosT12}
            </strong>
          </span>
        )}
        {m.zeroPhotoT12 !== null && (
          <span className="text-[13px] text-muted-foreground">
            · Share of T12 listings with no photo{" "}
            <strong className="dq-mono dq-tnum text-navy">
              {(m.zeroPhotoT12 * 100).toFixed(1)}%
            </strong>
          </span>
        )}
      </div>

      <div className="dq-rationale">
        <p className="dq-rationale-label">Reader&rsquo;s note</p>
        <p>
          Subscores are cap-normalized (amenities at 20, description at 500
          chars, completeness at 7 fields). The composite is the average of the
          three subscores. Marketing Quality enters the composite at 15%
          weight, ranked against the full MSA eligible cohort.
        </p>
      </div>
    </section>
  );
}
