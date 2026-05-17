import { SectionHead } from "./SectionHead";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function TableTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-navy">
      {children}
    </div>
  );
}

export function CoverageSection({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  const concentratedShare = c.concentratedShare;

  return (
    <section id="coverage" className="dq-section">
      <SectionHead
        num="02"
        title="Coverage universe"
        lede={`What we observe for ${scorecard.pm.name}, where we source it, and the size of the sample backing every figure on this page.`}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <TableTitle>Coverage parameters</TableTitle>
          <table className="dq-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>First observed listing</td>
                <td className="num">{fmtDate(c.firstListing)}</td>
              </tr>
              <tr>
                <td>Months on platform</td>
                <td className="num">{fmtInt(c.monthsOnPlatform)}</td>
              </tr>
              <tr>
                <td>Listings — lifetime</td>
                <td className="num">{fmtInt(c.lifetimeListings)}</td>
              </tr>
              <tr>
                <td>Listings — T12</td>
                <td className="num">{fmtInt(c.t12Listings)}</td>
              </tr>
              {c.t6Listings !== null && (
                <tr>
                  <td>Listings — T6</td>
                  <td className="num">{fmtInt(c.t6Listings)}</td>
                </tr>
              )}
              <tr>
                <td>URUs — lifetime / T12</td>
                <td className="num">
                  {fmtInt(c.urusLifetime)} / {fmtInt(c.urusT12)}
                </td>
              </tr>
              <tr>
                <td>Active inventory</td>
                <td className="num">{fmtInt(c.activeListings)}</td>
              </tr>
              <tr>
                <td>Data tier</td>
                <td className="num">
                  <span className="dq-pill dq-pill-navy-soft">
                    {c.dataTier}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <TableTitle>Portfolio composition</TableTitle>
          <table className="dq-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Observed managed units · this MSA</td>
                <td className="num">
                  <strong>{fmtInt(c.totalObservedUnits)}</strong>
                </td>
              </tr>
              {c.nationalObservedUnitsT12 !== null && (
                <tr>
                  <td>
                    Observed units · all Dwellsy IQ markets{" "}
                    <span className="text-muted-foreground">(T12)</span>
                  </td>
                  <td className="num">
                    {fmtInt(c.nationalObservedUnitsT12)}
                  </td>
                </tr>
              )}
              <tr>
                <td>Cities observed</td>
                <td className="num">{fmtInt(c.citiesObserved)}</td>
              </tr>
              {concentratedShare !== null && (
                <tr>
                  <td>
                    Share in concentrated communities{" "}
                    <span className="text-muted-foreground">
                      (≥10 units / community)
                    </span>
                  </td>
                  <td className="num">{fmtPct(concentratedShare * 100, 0)}</td>
                </tr>
              )}
              <tr>
                <td>Quadrant</td>
                <td className="num">
                  <span className="dq-pill dq-pill-navy-soft">
                    {scorecard.pm.quadrant}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-5 max-w-[720px] text-[13px] italic text-muted-foreground">
        URU = unique rental unit, deduplicated across listings. Coverage
        parameters reflect Dwellsy first-party intake; figures update monthly.
        Active inventory is a point-in-time count as of the methodology date.
      </p>
    </section>
  );
}
