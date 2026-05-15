import { SectionHead } from "./SectionHead";
import { fmtDate, fmtInt } from "@/lib/format";
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
  return (
    <section id="coverage" className="dq-section">
      <SectionHead
        num="02"
        title="Coverage universe"
        lede={`What we observed for ${scorecard.pm.name}, where we sourced it, and the size of the sample backing every figure on this page.`}
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
              <tr>
                <td>Listings — T6</td>
                <td className="num">{fmtInt(c.t6Listings)}</td>
              </tr>
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
                  <span className="dq-pill dq-pill-navy-soft">{c.dataTier}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <TableTitle>Observed unit composition</TableTitle>
          <table className="dq-table">
            <thead>
              <tr>
                <th>Asset class</th>
                <th className="num">Units</th>
                <th className="num">Addresses</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Institutional MF{" "}
                  <span className="text-muted-foreground">(≥50 units)</span>
                </td>
                <td className="num">{fmtInt(c.institutionalUnits)}</td>
                <td className="num">{fmtInt(c.institutionalBuildings)}</td>
              </tr>
              <tr>
                <td>
                  Small MF{" "}
                  <span className="text-muted-foreground">(2–49 units)</span>
                </td>
                <td className="num">{fmtInt(c.smallMfUnits)}</td>
                <td className="num">{fmtInt(c.smallMfBuildings)}</td>
              </tr>
              <tr>
                <td>Unit-level (large MF)</td>
                <td className="num">{fmtInt(c.unitLevelCount)}</td>
                <td className="num">—</td>
              </tr>
              <tr>
                <td>SFR / scattered</td>
                <td className="num">{fmtInt(c.sfrCount)}</td>
                <td className="num">—</td>
              </tr>
              <tr className="tr-total">
                <td>
                  <strong>Total observed</strong>
                </td>
                <td className="num">
                  <strong>{fmtInt(c.totalObservedUnits)}</strong>
                </td>
                <td className="num">
                  <strong>{fmtInt(c.institutionalBuildings + c.smallMfBuildings)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-5 max-w-[720px] text-[13px] italic text-muted-foreground">
        URU = unique rental unit, deduplicated across listings. Coverage
        parameters reflect Dwellsy first-party intake; figures update weekly.
        Active inventory is a point-in-time count as of the methodology date.
      </p>
    </section>
  );
}
