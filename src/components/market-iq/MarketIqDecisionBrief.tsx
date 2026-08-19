import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { buildMarketIqDecisionFindings, buildMarketIqPostures } from "@/lib/market-iq/intelligence";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number | null) {
  if (value === null) return "No comparison";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function directionLabel(value: number | null) {
  if (value === null) return "Not available";
  if (value >= 1) return "Rising";
  if (value <= -1) return "Softening";
  return "Holding";
}

const toneStyles = {
  rising: "border-teal-200 bg-teal-50 text-teal-900",
  softening: "border-orange-200 bg-orange-50 text-orange-950",
  mixed: "border-slate-200 bg-slate-50 text-navy",
  supply: "border-sky-200 bg-sky-50 text-navy",
};

export function MarketIqDecisionBrief({ report, marketName }: { report: MarketIqReportSnapshot; marketName: string }) {
  const findings = buildMarketIqDecisionFindings(report, marketName);
  const postures = buildMarketIqPostures(report.marketRead.cells);
  const historical = report.marketConditions.historical;

  return <>
    <section className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="dq-eyebrow">This month in {marketName}</p>
        <h2 className="dq-h2">The signals worth carrying into a pricing conversation</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">Ranked by breadth, persistence, and agreement across the MSA and its local markets. Exact figures remain visible as evidence, but isolated ZIP swings do not drive the headline.</p>
        <div className="mt-6 space-y-3">
          {findings.map((finding) => <article key={finding.id} className={`grid gap-4 rounded-2xl border p-5 sm:grid-cols-[38px_minmax(0,1fr)] ${toneStyles[finding.tone]}`}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-bold shadow-sm">{finding.rank}</span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] opacity-60">{finding.eyebrow}</p><h3 className="mt-1 text-lg font-semibold tracking-tight">{finding.headline}</h3><p className="mt-2 text-sm leading-6 opacity-75">{finding.detail}</p><p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-55">{finding.evidence}</p></div>
          </article>)}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-7"><p className="dq-eyebrow">Product posture</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-navy">One market, several rent stories</h2><p className="mt-2 text-sm leading-6 text-slate-500">Compare the same MSA product definitions across current rent, year-over-year direction, and the latest three-month path.</p></div>
        <div className="divide-y divide-slate-100">
          {postures.map((posture) => <article key={posture.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-6 py-4 sm:px-7">
            <div><p className="text-sm font-semibold text-navy">{posture.label}</p><p className="mt-1 text-xs text-slate-500">{posture.localAgreement ? `${posture.localAgreement.matching} of ${posture.localAgreement.total} local reads point ${posture.localAgreement.direction}` : "MSA benchmark"}</p></div>
            <div className="grid grid-cols-3 gap-5 text-right"><div><p className="text-sm font-semibold tabular-nums text-navy">{money(posture.rent)}</p><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Current</p></div><div><p className="text-sm font-semibold tabular-nums text-navy">{percentage(posture.yearOverYearPct)}</p><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">YoY</p></div><div><p className="text-sm font-semibold text-navy">{directionLabel(posture.recentPct)}</p><p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">3 month</p></div></div>
          </article>)}
          {!postures.length && <p className="px-7 py-10 text-sm text-slate-500">Consistent MSA product benchmarks are not available yet.</p>}
        </div>
      </div>
    </section>

    {historical && <section className="mt-6 rounded-3xl bg-navy p-6 text-white shadow-sm sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">Supply and leasing pace</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{report.marketConditions.heading}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">This is the latest 30-day listing period compared with the immediately preceding 30 days. {report.marketConditions.narrative}</p></div><div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4"><div><p className="text-2xl font-semibold">{historical.activeAtCutoff.toLocaleString()}</p><p className="text-xs text-white/50">active at cutoff</p></div><div><p className="text-2xl font-semibold">{historical.newListings30d.toLocaleString()}</p><p className="text-xs text-white/50">new in 30 days</p></div><div><p className="text-2xl font-semibold">{percentage(historical.newListingsChange)}</p><p className="text-xs text-white/50">vs. prior 30 days</p></div><div><p className="text-2xl font-semibold">{Math.round(historical.medianDom)} days</p><p className="text-xs text-white/50">median DOM</p></div></div></div>
      <p className="mt-6 border-t border-white/10 pt-4 text-xs text-white/45">Listing measures describe advertised supply and velocity. They are not used to calculate rent, occupancy, or signed-lease performance.</p>
    </section>}
  </>;
}
