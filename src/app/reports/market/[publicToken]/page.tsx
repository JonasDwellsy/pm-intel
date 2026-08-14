import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketIqRentMap } from "@/components/market-iq/report/MarketIqRentMap";
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
    description: `An interactive local market read prepared by ${report.brand.displayName}.`,
    icons: { icon: report.brand.logoUrl ?? "/market-report-icon.svg" },
    robots: { index: false, follow: false },
  };
}

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(value);
}

function month(value: string | null) {
  if (!value) return "No reportable month";
  return new Date(`${value.slice(0, 7)}-15T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

function change(value: number | null) {
  if (value === null) return "Change not published";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}% year over year`;
}

function TrendCell({ cell }: { cell: MarketIqMarketCell }) {
  if (cell.status === "suppressed") return <div className="rounded-xl bg-slate-50 px-4 py-4">
    <p className="font-semibold text-slate-700">{cell.label}</p>
    <p className="mt-2 text-sm text-slate-500">Not published</p>
    <p className="mt-1 text-xs leading-5 text-slate-400">{cell.suppressionReason}</p>
  </div>;
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-700">{cell.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{money(cell.rent)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cell.yearOverYearPct !== null && cell.yearOverYearPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{cell.yearOverYearPct === null ? "YoY unavailable" : `${cell.yearOverYearPct >= 0 ? "+" : ""}${cell.yearOverYearPct.toFixed(1)}%`}</span></div>
    <p className="mt-3 text-xs text-slate-500">Trends IQ · N={cell.observations.toLocaleString()} · {month(cell.month)}</p>
  </div>;
}

function CityPanel({ city, cells }: { city: string; cells: MarketIqMarketCell[] }) {
  const reportable = cells.filter((cell) => cell.status === "reportable");
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
    <header className="border-b border-slate-100 px-6 py-5"><div className="flex items-center justify-between gap-4"><h3 className="text-xl font-semibold text-[var(--report-primary)]">{city}</h3><span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{reportable.length} reportable segments</span></div></header>
    <div className="grid gap-3 p-4 sm:grid-cols-2">{cells.map((cell) => <TrendCell key={cell.key} cell={cell} />)}</div>
  </article>;
}

export default async function PublicMarketReportPage({ params }: PageProps) {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) notFound();
  const reportStyle = { "--report-primary": report.brand.primaryColor, "--report-accent": report.brand.accentColor } as CSSProperties;
  const reportable = report.marketRead.cells.filter((cell) => cell.status === "reportable");
  const cityCells = report.marketRead.cells.filter((cell) => cell.geographyType === "city");
  const zipCells = report.marketRead.cells.filter((cell) => cell.geographyType === "zip");
  const cities = report.scope.cities.map((city) => ({ city, cells: cityCells.filter((cell) => cell.geographyLabel === city) }));
  const zips = report.scope.zipCodes.map((zip) => ({ zip, cells: zipCells.filter((cell) => cell.geographyValue === zip) }));
  const featured = reportable.filter((cell) => cell.geographyType !== "zip").slice(0, 4);
  const trendsSource = report.sources.find((source) => source.name.includes("Trends"));

  return <main style={reportStyle} className="min-h-screen bg-[#f7f6f2] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
        <div>{report.brand.logoUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={report.brand.logoUrl} alt={report.brand.displayName} className="max-h-10 max-w-[210px] object-contain object-left" /></> : <p className="text-lg font-bold tracking-tight text-[var(--report-primary)]">{report.brand.displayName}</p>}<p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Interactive local market read</p></div>
        <div className="flex items-center gap-4 text-right text-xs text-slate-500"><div className="hidden sm:block"><p>Rent data through {trendsSource?.availableThrough ?? report.scope.periodEnd}</p><p className="mt-1">Prepared {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p></div><a href={`/reports/market/${publicToken}/pdf`} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-600 hover:border-slate-500">PDF export</a></div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
      <section className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--report-accent)]">{report.scope.marketName}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.06] tracking-tight text-[var(--report-primary)] sm:text-6xl">What the local rental market is doing now</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">{report.marketRead.narrative}</p></div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.06)]"><p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--report-accent)]">How to read this</p><p className="mt-3 text-lg font-semibold text-[var(--report-primary)]">Rent comes only from Trends IQ</p><p className="mt-2 text-sm leading-6 text-slate-600">Each published rent level and change uses the same validated monthly series. Sample size and observation month travel with every number.</p></aside>
      </section>

      {featured.length > 0 && <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featured.map((cell) => <article key={cell.key} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">{cell.geographyLabel}</p><p className="mt-2 text-sm font-semibold text-slate-700">{cell.label}</p><p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">{money(cell.rent)}</p><p className="mt-2 text-sm font-semibold text-[var(--report-accent)]">{change(cell.yearOverYearPct)}</p><p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Trends IQ · N={cell.observations.toLocaleString()} · {month(cell.month)}</p></article>)}</section>}

      <section className="mt-16"><div className="mb-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">ZIP market map</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">{report.marketMap.heading}</h2></div><p className="max-w-2xl leading-7 text-slate-600 lg:justify-self-end">{report.marketMap.narrative}</p></div><MarketIqRentMap points={report.marketMap.points} primaryColor={report.brand.primaryColor} accentColor={report.brand.accentColor} /></section>

      <section className="mt-16"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">City detail</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">A separate read for each municipality</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">Cities are orientation geographies, not substitutes for ZIP-level results. Each panel contains only that city’s own Trends IQ observations.</p><div className="mt-8 grid gap-6 lg:grid-cols-2">{cities.map(({ city, cells }) => <CityPanel key={city} city={city} cells={cells} />)}</div></section>

      <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-9"><div className="border-b border-slate-100 pb-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">ZIP detail</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">The closest supported local read</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">No city or MSA value is substituted when a ZIP is thin. A ZIP remains visibly unavailable until its own Trends IQ sample is sufficient.</p></div><div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{zips.map(({ zip, cells }) => <article key={zip} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-[var(--report-primary)]">ZIP {zip}</h3><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Trends IQ</span></div><div className="mt-4 space-y-3">{cells.map((cell) => <TrendCell key={cell.key} cell={cell} />)}</div></article>)}</div></section>

      <section className="mt-16 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><article className="rounded-3xl bg-[var(--report-primary)] p-8 text-white sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Conditions and the so-what</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">{report.marketConditions.heading}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-white/80">{report.marketConditions.narrative}</p></article>{report.marketConditions.historical && <article className="rounded-3xl border border-slate-200 bg-white p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Total IQ listing activity</p><dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"><div><dt className="text-sm text-slate-500">Active at cutoff</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.activeAtCutoff.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">New, 30 days</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.newListings30d.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">New-listing change</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.newListingsChange >= 0 ? "+" : ""}{report.marketConditions.historical.newListingsChange.toFixed(1)}%</dd></div><div><dt className="text-sm text-slate-500">Median DOM</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{Math.round(report.marketConditions.historical.medianDom)} days</dd></div></dl><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">These measures describe listing activity. They are not used to calculate any rent shown on this page.</p></article>}</section>

      <section className="mt-16 rounded-3xl border border-sky-200 bg-sky-50 p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-800">Observed and source-specific</p><h2 className="mt-3 text-2xl font-semibold text-[var(--report-primary)]">Price and activity are never blended</h2><p className="mt-3 max-w-4xl leading-7 text-slate-700">Trends IQ is the exclusive price source. Total IQ contributes only observed listing activity and geography. Sample sizes and dates remain attached, and unsupported cells stay unpublished.</p>{report.marketRead.unavailableCuts.map((item) => <div key={item.label} className="mt-5 rounded-xl bg-white p-5"><p className="font-semibold text-slate-800">{item.label}: unavailable</p><p className="mt-1 text-sm leading-6 text-slate-600">{item.reason}</p></div>)}</section>

      <section className="mt-16 border-t border-slate-300 pt-8 text-sm leading-6 text-slate-500"><h2 className="font-semibold text-slate-800">Sources and methodology</h2><div className="mt-4 grid gap-5 sm:grid-cols-2">{report.sources.map((source) => <div key={`${source.name}:${source.availableThrough}`}><p className="font-semibold text-slate-700">{source.name}</p><p>Available through {source.availableThrough}{source.observationCount ? ` · ${source.observationCount.toLocaleString()} observations` : ""}</p><p>{source.note}</p></div>)}</div><p className="mt-6">{report.methodNote}</p><p className="mt-3">{report.disclosure}</p><div className="mt-9 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-700">Prepared by {report.brand.displayName}</p>{(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <p className="mt-1 text-xs">{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" · ")}</p>}</div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Market data by Dwellsy IQ</p></div></section>
    </div>
  </main>;
}
