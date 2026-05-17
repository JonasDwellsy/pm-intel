import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { ScorecardData, TenancyAssetBlock } from "@/lib/types";

type Asset = "Apartments" | "Houses";
type Row = { asset: Asset; block: TenancyAssetBlock };

// v0.6.1 tenancy: per-asset (apt + house) episode-clustered gaps in months,
// plus cohort p25/p50/p75 within the same MSA. Episode methodology is
// unchanged from v0.3.4. We render a layered range bar (cohort range +
// operator pin) and the underlying numbers.
function TenancyRangeBar({ row }: { row: Row }) {
  const W = 720;
  const H = 130;
  const padL = 24;
  const padR = 36;
  const minM = 4;
  const maxM = 32;
  const xOf = (m: number) =>
    padL +
    ((Math.max(minM, Math.min(maxM, m)) - minM) / (maxM - minM)) *
      (W - padL - padR);
  const trackY = 60;
  const trackH = 24;

  const { gap, cohortP25, cohortP50, cohortP75 } = row.block;
  const hasCohort = cohortP25 !== null && cohortP75 !== null;
  const cohortX0 = hasCohort ? xOf(cohortP25!) : 0;
  const cohortX1 = hasCohort ? xOf(cohortP75!) : 0;
  const p50X = cohortP50 !== null ? xOf(cohortP50) : null;
  const opX = gap !== null ? xOf(gap) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      aria-label={`${row.asset} tenancy range`}
    >
      <rect
        x={padL}
        y={trackY}
        width={W - padL - padR}
        height={trackH}
        rx={3}
        fill="#EEF2F6"
        stroke="#E6EAF0"
      />
      {hasCohort && (
        <rect
          x={cohortX0}
          y={trackY}
          width={Math.max(2, cohortX1 - cohortX0)}
          height={trackH}
          fill="#D9E7CE"
          stroke="#A8C792"
        />
      )}
      {p50X !== null && (
        <g>
          <line
            x1={p50X}
            x2={p50X}
            y1={trackY - 4}
            y2={trackY + trackH + 4}
            stroke="#3E7C3E"
            strokeWidth={2}
          />
          <text
            x={p50X}
            y={trackY - 8}
            textAnchor="middle"
            fill="#3E7C3E"
            fontSize="11"
            fontWeight={600}
          >
            p50 {cohortP50!.toFixed(1)}
          </text>
        </g>
      )}
      {opX !== null && gap !== null && (
        <g>
          <line
            x1={opX}
            x2={opX}
            y1={trackY - 18}
            y2={trackY + trackH + 12}
            stroke="#C97B70"
            strokeWidth={2.5}
          />
          <circle
            cx={opX}
            cy={trackY + trackH / 2}
            r={7}
            fill="#C97B70"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
          <text
            x={opX}
            y={trackY + trackH + 26}
            textAnchor="middle"
            fill="#843225"
            fontSize="12"
            fontWeight={700}
          >
            {gap.toFixed(1)} mo
          </text>
        </g>
      )}
      {[4, 12, 20, 28, 32].map((t) => (
        <g key={t}>
          <line
            x1={xOf(t)}
            x2={xOf(t)}
            y1={trackY + trackH}
            y2={trackY + trackH + 4}
            stroke="#8A92A2"
          />
          <text
            x={xOf(t)}
            y={trackY + trackH + 16}
            textAnchor="middle"
            fill="#8A92A2"
            fontSize="10"
            fontFamily="var(--font-mono), monospace"
          >
            {t}mo
          </text>
        </g>
      ))}
    </svg>
  );
}

// Derive a coarse position label from the operator's gap vs cohort percentiles.
// Returns null when there's no cohort range to compare against.
function positionLabel(b: TenancyAssetBlock): string | null {
  if (b.gap === null || b.cohortP25 === null || b.cohortP75 === null) {
    return null;
  }
  if (b.gap < b.cohortP25) return "Below cohort range";
  if (b.gap > b.cohortP75) return "Above cohort range";
  return "Within cohort range";
}

function TenancyAssetCard({ row }: { row: Row }) {
  const label = positionLabel(row.block);
  const { gap, n, cohortP50, cohortN } = row.block;
  const pctMedian =
    gap !== null && cohortP50 !== null && cohortP50 > 0
      ? Math.round((gap / cohortP50) * 100)
      : null;

  return (
    <div className="rounded-lg border border-grid bg-white p-6">
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[160px_minmax(0,1fr)_180px]">
        <div>
          <p className="text-[15px] font-bold text-navy">{row.asset}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            n = {fmtInt(n)} operator · {fmtInt(cohortN)} cohort
          </p>
        </div>
        <div className="min-w-0">
          <TenancyRangeBar row={row} />
        </div>
        <div className="text-right">
          {label ? (
            <p className="text-[12px] font-semibold text-rose">{label}</p>
          ) : (
            <p className="text-[12px] text-muted-foreground">not assessed</p>
          )}
          {pctMedian !== null && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {fmtInt(pctMedian)}% of cohort median
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TenancySection({ scorecard }: { scorecard: ScorecardData }) {
  const t = scorecard.tenancy;
  const rows: Row[] = [
    { asset: "Apartments", block: t.apartment },
    { asset: "Houses", block: t.house },
  ];

  return (
    <section id="tenancy" className="dq-section">
      <SectionHead
        num="05"
        title="Tenancy position vs. MSA cohort"
        lede={`How long tenants stay before turning over. Cohort range shows the p25–p75 of comparable operators; ${scorecard.pm.name}'s median is plotted alongside. Composite weight 30%.`}
      />

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <TenancyAssetCard key={row.asset} row={row} />
        ))}
      </div>

      <table className="dq-table mt-7">
        <thead>
          <tr>
            <th>Asset class</th>
            <th className="num">Operator</th>
            <th className="num">Cohort typical range</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { gap, cohortP25, cohortP75 } = row.block;
            const label = positionLabel(row.block);
            return (
              <tr key={row.asset}>
                <td>{row.asset}</td>
                <td className="num">
                  {gap !== null ? (
                    <span className="dq-val-soft">{gap.toFixed(1)} mo</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="num">
                  {cohortP25 !== null && cohortP75 !== null ? (
                    <>
                      {fmtNumber(cohortP25, 1)} – {fmtNumber(cohortP75, 1)} mo{" "}
                      <span className="text-muted-foreground">(p25–p75)</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">insufficient n</span>
                  )}
                </td>
                <td>
                  {label ? (
                    <span className="dq-pill dq-pill-rose">{label}</span>
                  ) : (
                    <span className="text-muted-foreground">not assessed</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <aside className="dq-callout-important">
        <p className="dq-callout-tag">Important — read this caveat</p>
        <p>
          Tenancy is a <strong>comparative</strong> metric, not an absolute
          one. A median sitting just below cohort p25 is not, on its own, a
          quality signal — high-turnover sub-markets and large-floorplate
          buildings routinely sit there. Use this row to ask whether{" "}
          {scorecard.pm.name}&rsquo;s tenant base is structurally shorter-tenured
          than peers, then triangulate with renewal-rate and rent-growth data
          when available.
        </p>
      </aside>
    </section>
  );
}
