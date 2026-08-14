import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicMarketIqReport } from "@/lib/market-iq/report/build.server";
import type { MarketIqMarketCell } from "@/lib/market-iq/report/report";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) return { title: "Local market read" };
  return {
    title: { absolute: `${report.brand.displayName} | ${report.scope.marketName} market read` },
    description: `A local market read prepared by ${report.brand.displayName}.`,
    icons: { icon: report.brand.logoUrl ?? "/market-report-icon.svg" },
    robots: { index: false, follow: false },
  };
}

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(value);
}

function trajectory(cell: MarketIqMarketCell) {
  if (!cell.trajectory) return "Trajectory not published";
  const value = cell.trajectory.yearOverYearPct;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}% year over year`;
}

function SegmentCard({ cell }: { cell: MarketIqMarketCell }) {
  if (cell.status === "suppressed") return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{cell.geographyLabel} · {cell.label}</p>
      <p className="mt-5 text-xl font-semibold text-slate-700">Not published</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{cell.suppressionReason}</p>
      <p className="mt-4 text-xs text-slate-400">{cell.rentLevel.observations} observed listings</p>
    </article>
  );
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{cell.geographyLabel}</p>
      <p className="mt-2 font-semibold text-[var(--report-primary)]">{cell.label}</p>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">{money(cell.rentLevel.medianAskingRent)}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--report-accent)]">{trajectory(cell)}</p>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm">
        <div><p className="text-slate-500">Median rent / sf</p><p className="mt-1 font-semibold text-slate-800">{cell.rentLevel.medianRentPerSqFt === null ? "Not published" : `$${cell.rentLevel.medianRentPerSqFt.toFixed(2)}`}</p></div>
        <div><p className="text-slate-500">Observed sample</p><p className="mt-1 font-semibold text-slate-800">{cell.rentLevel.observations.toLocaleString()} listings</p></div>
      </div>
      <p className="mt-4 text-xs text-slate-400">Level through {cell.rentLevel.availableThrough}{cell.trajectory ? ` · Trend month ${cell.trajectory.month}` : ""}</p>
    </article>
  );
}

export default async function PublicMarketReportPage({ params }: PageProps) {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) notFound();
  const reportable = report.marketRead.cells.filter((cell) => cell.status === "reportable");
  const suppressed = report.marketRead.cells.filter((cell) => cell.status === "suppressed");
  const reportStyle = { "--report-primary": report.brand.primaryColor, "--report-accent": report.brand.accentColor } as CSSProperties;

  return <main style={reportStyle} className="min-h-screen bg-[#f7f6f2] text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
        <div>{report.brand.logoUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={report.brand.logoUrl} alt={report.brand.displayName} className="max-h-12 max-w-[220px] object-contain object-left" /></> : <p className="text-xl font-bold tracking-tight text-[var(--report-primary)]">{report.brand.displayName}</p>}<p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Local market read</p></div>
        <div className="text-right text-sm text-slate-500"><p>{report.scope.periodStart} to {report.scope.periodEnd}</p><p className="mt-1">Prepared {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p><a href={`/reports/market/${publicToken}/pdf`} className="mt-3 inline-flex rounded-md bg-[var(--report-primary)] px-3 py-2 text-xs font-semibold text-white">Download PDF</a></div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10 lg:py-16">
      <section className="grid gap-10 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
        <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--report-accent)]">{report.scope.marketName}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--report-primary)] sm:text-6xl">Your local asking market, observed clearly</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">{report.marketRead.narrative}</p></div>
        <aside className="rounded-2xl bg-[var(--report-primary)] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.17em] text-white/70">Observed market scope</p><p className="mt-4 text-3xl font-semibold">{report.scope.totalObservedListings.toLocaleString()} listings</p><p className="mt-2 text-sm leading-6 text-white/75">{report.scope.submarkets.join(", ")} · houses and apartments by bedroom.</p></aside>
      </section>

      <section className="mt-16"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Market read</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">Rent level and direction by local segment</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">Level is the median asking rent observed in Total IQ. Direction comes separately from the validated Trends engine. Each card shows its own sample and dates.</p><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{reportable.slice(0, 9).map((cell) => <SegmentCard key={cell.key} cell={cell} />)}</div></section>

      <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-9">
        <div className="border-b border-slate-100 pb-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Submarket detail</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">The local evidence behind the read</h2></div>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.14em] text-slate-500"><th className="px-3 py-4">Submarket</th><th className="px-3 py-4">Segment</th><th className="px-3 py-4">Median ask</th><th className="px-3 py-4">Rent / sf</th><th className="px-3 py-4">Trajectory</th><th className="px-3 py-4">Observed N</th><th className="px-3 py-4">As of</th></tr></thead><tbody>{reportable.map((cell) => <tr key={cell.key} className="border-b border-slate-100 last:border-0"><td className="px-3 py-5 font-semibold text-[var(--report-primary)]">{cell.geographyLabel}</td><td className="px-3 py-5 text-slate-700">{cell.label}</td><td className="px-3 py-5 font-semibold">{money(cell.rentLevel.medianAskingRent)}</td><td className="px-3 py-5">{cell.rentLevel.medianRentPerSqFt === null ? "Not published" : `$${cell.rentLevel.medianRentPerSqFt.toFixed(2)}`}</td><td className="px-3 py-5 font-semibold text-[var(--report-accent)]">{trajectory(cell)}</td><td className="px-3 py-5 text-slate-600">{cell.rentLevel.observations.toLocaleString()}</td><td className="px-3 py-5 text-sm text-slate-500">{cell.rentLevel.availableThrough}</td></tr>)}</tbody></table></div>
        {suppressed.length > 0 && <details className="mt-6 rounded-xl bg-slate-50 px-5 py-4 text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-slate-800">{suppressed.length} thin-sample cells not published</summary><ul className="mt-3 space-y-2">{suppressed.map((cell) => <li key={cell.key}>{cell.geographyLabel}, {cell.label}: {cell.suppressionReason}</li>)}</ul></details>}
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><article className="rounded-3xl bg-[var(--report-primary)] p-8 text-white sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Conditions and the so-what</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">{report.marketConditions.heading}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-white/80">{report.marketConditions.narrative}</p></article>{report.marketConditions.historical && <article className="rounded-3xl border border-slate-200 bg-white p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">At the Total IQ cutoff</p><dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"><div><dt className="text-sm text-slate-500">Active listings</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.activeAtCutoff.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">New, 30 days</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.newListings30d.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">Median DOM</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{Math.round(report.marketConditions.historical.medianDom)} days</dd></div><div><dt className="text-sm text-slate-500">Median rent / sf</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">${report.marketConditions.historical.medianRentPerSqFt.toFixed(2)}</dd></div></dl></article>}</section>

      <section className="mt-16 rounded-3xl border border-sky-200 bg-sky-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-800">Observed, not modeled</p><h2 className="mt-3 text-2xl font-semibold text-[var(--report-primary)]">Every published figure stands on visible evidence</h2><p className="mt-3 max-w-4xl leading-7 text-slate-700">This read uses observed rental listings for level and the validated Dwellsy IQ Trends methodology for direction. Sample sizes and dates travel with the number. Thin or conflicted cuts are withheld instead of estimated.</p>{report.marketRead.unavailableCuts.map((item) => <div key={item.label} className="mt-5 rounded-xl bg-white p-5"><p className="font-semibold text-slate-800">{item.label}: unavailable</p><p className="mt-1 text-sm leading-6 text-slate-600">{item.reason}</p></div>)}</section>

      <section className="mt-16 border-t border-slate-300 pt-8 text-sm leading-6 text-slate-500"><h2 className="font-semibold text-slate-800">Sources and methodology</h2><div className="mt-4 grid gap-5 sm:grid-cols-2">{report.sources.map((source) => <div key={`${source.name}:${source.availableThrough}`}><p className="font-semibold text-slate-700">{source.name}</p><p>Available through {source.availableThrough}{source.observationCount ? ` · ${source.observationCount.toLocaleString()} observations` : ""}</p><p>{source.note}</p></div>)}</div><p className="mt-6">{report.methodNote}</p><p className="mt-3">{report.disclosure}</p><div className="mt-9 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-700">Prepared by {report.brand.displayName}</p>{(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <p className="mt-1 text-xs">{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" · ")}</p>}</div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Market data by Dwellsy IQ</p></div></section>
    </div>
  </main>;
}
