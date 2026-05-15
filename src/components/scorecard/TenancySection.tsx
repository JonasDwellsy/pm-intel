import { SectionHead } from "./SectionHead";
import { fmtInt, fmtNumber } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

type TenancyRow = {
  asset: "Apartments" | "Houses";
  op: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  n_op: number;
  n_cohort: number;
  position: string | null;
  pctMedian: number | null;
};

// Layered range bar:
//  back  — grey full-range context bar (4mo to 32mo)
//  middle — green cohort p25–p75 band
//  fore   — green p50 vertical tick + label
//  pin    — rose operator marker (vertical line + dot + bold label)
function TenancyRangeBar({ row }: { row: TenancyRow }) {
  const W = 720;
  const H = 130;
  const padL = 24;
  const padR = 36;
  const minM = 4;
  const maxM = 32;
  const xOf = (m: number) =>
    padL + ((Math.max(minM, Math.min(maxM, m)) - minM) / (maxM - minM)) * (W - padL - padR);
  const trackY = 60;
  const trackH = 24;

  const hasCohort = row.p25 !== null && row.p75 !== null;
  const hasOp = row.op !== null;
  const cohortX0 = hasCohort ? xOf(row.p25!) : 0;
  const cohortX1 = hasCohort ? xOf(row.p75!) : 0;
  const p50X = row.p50 !== null ? xOf(row.p50) : null;
  const opX = hasOp ? xOf(row.op!) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      aria-label={`${row.asset} tenancy range`}
    >
      {/* Full-range context bar */}
      <rect
        x={padL}
        y={trackY}
        width={W - padL - padR}
        height={trackH}
        rx={3}
        fill="#EEF2F6"
        stroke="#E6EAF0"
      />
      {/* Cohort p25–p75 band */}
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
      {/* p50 tick + label */}
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
            p50 {row.p50!.toFixed(1)}
          </text>
        </g>
      )}
      {/* Operator marker */}
      {opX !== null && (
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
            {row.op!.toFixed(1)} mo
          </text>
        </g>
      )}
      {/* Axis ticks */}
      {[4, 12, 20, 28, 32].map((t) => (
        <g key={t}>
          <line
            x1={xOf(t)}
            x2={xOf(t)}
            y1={trackY + trackH}
            y2={trackY + trackH + 4}
            stroke="#8A92A2"
            strokeWidth={1}
          />
          <text
            x={xOf(t)}
            y={trackY + trackH + 16}
            textAnchor="middle"
            fill="#8A92A2"
            fontSize="10"
            fontFamily='var(--font-mono), monospace'
          >
            {t}mo
          </text>
        </g>
      ))}
    </svg>
  );
}

function TenancyAssetCard({ row }: { row: TenancyRow }) {
  return (
    <div className="rounded-lg border border-grid bg-white p-6">
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[160px_minmax(0,1fr)_180px]">
        <div>
          <p className="text-[15px] font-bold text-navy">{row.asset}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            n = {fmtInt(row.n_op)} operator · {fmtInt(row.n_cohort)} cohort
          </p>
        </div>
        <div className="min-w-0">
          <TenancyRangeBar row={row} />
        </div>
        <div className="text-right">
          {row.position ? (
            <p className="text-[12px] font-semibold text-rose">{row.position}</p>
          ) : (
            <p className="text-[12px] text-muted-foreground">not assessed</p>
          )}
          {row.pctMedian !== null && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {fmtInt(row.pctMedian)}% of cohort median
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TenancySection({ scorecard }: { scorecard: ScorecardData }) {
  const t = scorecard.tenancy;
  const rows: TenancyRow[] = [
    {
      asset: "Apartments",
      op: t.aptGap,
      p25: t.aptP25,
      p50: t.aptP50,
      p75: t.aptP75,
      n_op: t.aptN,
      n_cohort: t.aptCohortN,
      position: t.aptPosition,
      pctMedian: t.aptPctMedian,
    },
    {
      asset: "Houses",
      op: t.sfrGap,
      p25: t.sfrP25,
      p50: t.sfrP50,
      p75: t.sfrP75,
      n_op: t.sfrN,
      n_cohort: t.sfrCohortN,
      position: t.sfrPosition,
      pctMedian: t.sfrPctMedian,
    },
  ];

  return (
    <section id="tenancy" className="dq-section">
      <SectionHead
        num="10"
        title="Tenancy position vs. MSA cohort"
        lede={`How long tenants stay before turning over. Cohort range shows the p25–p75 of comparable operators; ${scorecard.pm.name}'s median is plotted alongside.`}
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
          {rows.map((row) => (
            <tr key={row.asset}>
              <td>{row.asset}</td>
              <td className="num">
                {row.op !== null ? (
                  <span className="dq-val-soft">{row.op.toFixed(1)} mo</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="num">
                {row.p25 !== null && row.p75 !== null ? (
                  <>
                    {fmtNumber(row.p25, 1)} – {fmtNumber(row.p75, 1)} mo{" "}
                    <span className="text-muted-foreground">(p25–p75)</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">insufficient n</span>
                )}
              </td>
              <td>
                {row.position ? (
                  <>
                    <span className="dq-pill dq-pill-rose">{row.position}</span>{" "}
                    {row.pctMedian !== null && (
                      <span className="text-muted-foreground">
                        · {fmtInt(row.pctMedian)}% of cohort median
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">not assessed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <aside className="dq-callout-important">
        <p className="dq-callout-tag">Important — read this caveat</p>
        <p>
          Tenancy is a <strong>comparative</strong> metric, not an absolute one.
          A median sitting just below cohort p25 is not, on its own, a quality
          signal — high-turnover sub-markets and large-floorplate buildings
          routinely sit there. Use this row to ask whether{" "}
          {scorecard.pm.name}'s tenant base is structurally shorter-tenured
          than peers, then triangulate with renewal-rate and rent-growth data
          when available.
        </p>
      </aside>
    </section>
  );
}
