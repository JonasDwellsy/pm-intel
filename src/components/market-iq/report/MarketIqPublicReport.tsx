"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { MarketIqRentMap } from "@/components/market-iq/report/MarketIqRentMap";
import { MarketIqDailyEvents } from "@/components/market-iq/report/MarketIqDailyEvents";
import { MarketIqTimeToResolution } from "@/components/market-iq/report/MarketIqTimeToResolution";
import type { MarketIqMarketCell, MarketIqReportSnapshot, MarketIqTrendPoint } from "@/lib/market-iq/report/report";
import { availableMarketIqActivity } from "@/lib/market-iq/listing-events";
import { getMarketIqMarket } from "@/data/market-iq/markets";

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

function change(value: number | null, suffix = true) {
  if (value === null) return "Change not published";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%${suffix ? " year over year" : ""}`;
}

function publicSourceName(name: string) {
  if (name.includes("Trends")) return "Asking-rent trends";
  if (name.includes("inactive listings")) return "Time-to-resolution observations";
  if (name.includes("listing activity feed")) return "Recent listing activity";
  if (name.includes("observed listings")) return "Listing activity history";
  return name;
}

function publicSourceNote(note: string) {
  return note
    .replaceAll("Dwellsy IQ Trends", "the asking-rent series")
    .replaceAll("Trends IQ", "the asking-rent series")
    .replaceAll("Total IQ", "listing observations");
}

const COMPETITIVE_FINDING_LABELS = {
  new_to_market: "New listing",
  rent_changes: "Rent move",
  off_market: "Off market",
  aging_watch: "Aging watch",
  concessions: "Concession",
  lease_up: "Lease-up",
} as const;

function Sparkline({ points }: { points: MarketIqTrendPoint[] }) {
  if (points.length < 2) return <div className="grid h-20 place-items-center rounded-lg bg-slate-50 text-xs text-slate-400">Trend history is limited</div>;
  const rents = points.map((point) => point.rent);
  const min = Math.min(...rents);
  const max = Math.max(...rents);
  const range = Math.max(1, max - min);
  const width = 320;
  const height = 82;
  const coordinates = points.map((point, index) => ({
    x: 8 + (index * (width - 16)) / Math.max(1, points.length - 1),
    y: 8 + ((max - point.rent) / range) * (height - 20),
    point,
  }));
  const segments: typeof coordinates[] = [];
  coordinates.forEach((coordinate, index) => {
    const previous = coordinates[index - 1];
    const gap = previous ? new Date(coordinate.point.month).getTime() - new Date(previous.point.month).getTime() : 0;
    if (!previous || gap > 70 * 86_400_000) segments.push([coordinate]);
    else segments.at(-1)?.push(coordinate);
  });
  const hasGap = segments.length > 1;
  return <div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" aria-label="Monthly asking-rent trend">
      <line x1="8" y1={height - 8} x2={width - 8} y2={height - 8} stroke="#e2e8f0" strokeWidth="1" />
      {segments.map((segment, index) => <polyline key={index} points={segment.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" ")} fill="none" stroke="var(--report-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      {coordinates.map(({ x, y, point }) => <circle key={point.month} cx={x} cy={y} r="3" fill="var(--report-primary)" />)}
    </svg>
    <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400"><span>{month(points[0]?.month ?? null)}</span>{hasGap && <span>Source gap shown</span>}<span>{month(points.at(-1)?.month ?? null)}</span></div>
  </div>;
}

function SummaryCard({ cell }: { cell: MarketIqMarketCell }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{cell.label}</p><p className="mt-3 text-4xl font-semibold tracking-tight text-[var(--report-primary)]">{money(cell.rent)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Overall rent level</span></div>
    <p className="mt-3 text-lg font-semibold text-[var(--report-accent)]">Latest all-bedroom median</p>
    <div className="mt-6"><Sparkline points={cell.series} /></div>
    <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Asking-rent data · {month(cell.month)} · all-bedroom median</p>
  </article>;
}

function MunicipalityBenchmarkCard({ city, cells }: { city: string; cells: MarketIqMarketCell[] }) {
  const rows = [
    { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
    { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
  ] as const;
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)]">
    <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-lg font-semibold text-[var(--report-primary)]">{city}</h3><p className="mt-1 text-xs text-slate-400">Latest asking-rent benchmarks</p></div>
    <div className="divide-y divide-slate-100">{rows.map((row) => {
      const cell = cells.find((candidate) => candidate.propertyType === row.propertyType && candidate.bedrooms === row.bedrooms);
      return <div key={`${city}:${row.propertyType}:${row.bedrooms}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.11em] text-slate-400">{row.label}</p>{cell ? <><p className="mt-2 text-2xl font-semibold text-slate-900">{money(cell.rent)}</p><p className="mt-1 text-xs text-slate-500">Asking-rent data · {month(cell.month)}</p></> : <p className="mt-3 text-sm text-slate-400">No value available</p>}</div>{cell && <p className={`pt-1 text-sm font-bold ${(cell.yearOverYearPct ?? 0) >= 1 ? "text-teal-700" : (cell.yearOverYearPct ?? 0) <= -1 ? "text-orange-700" : "text-slate-500"}`}>{change(cell.yearOverYearPct, false)}</p>}</div>;
    })}</div>
  </article>;
}

export function MarketIqPublicReport({ report, publicToken, preview = false }: {
  report: MarketIqReportSnapshot;
  publicToken?: string;
  preview?: boolean;
}) {
  const market = getMarketIqMarket(report.scope.marketId);
  const marketActivity = availableMarketIqActivity(report.marketActivity);
  const reportStyle = { "--report-primary": report.brand.primaryColor, "--report-accent": report.brand.accentColor } as CSSProperties;
  const reportable = report.marketRead.cells.filter((cell) => cell.status === "reportable");
  const msaRollups = reportable.filter((cell) => cell.geographyType === "msa" && cell.bedrooms === 999);
  const benchmarkApartment = reportable.find((cell) => cell.geographyType === "msa" && cell.propertyType === "apartment" && cell.bedrooms === 1);
  const benchmarkHouse = reportable.find((cell) => cell.geographyType === "msa" && cell.propertyType === "house" && cell.bedrooms === 3);
  const cityBenchmarkCells = report.marketRead.cells.filter((cell) => cell.geographyType === "city" && (
    (cell.propertyType === "apartment" && cell.bedrooms === 1) ||
    (cell.propertyType === "house" && cell.bedrooms === 3)
  ));
  const cityBenchmarks = cityBenchmarkCells.filter((cell) => cell.status === "reportable");
  const supportedCities = [...new Set(cityBenchmarks.map((cell) => cell.geographyLabel))].sort();
  const withheldCities = report.scope.cities.filter((city) => !supportedCities.includes(city));
  const strongest = cityBenchmarks.filter((cell) => cell.yearOverYearPct !== null).sort((a, b) => (b.yearOverYearPct ?? 0) - (a.yearOverYearPct ?? 0))[0];
  const softest = cityBenchmarks.filter((cell) => cell.yearOverYearPct !== null).sort((a, b) => (a.yearOverYearPct ?? 0) - (b.yearOverYearPct ?? 0))[0];
  const conditions = report.marketConditions.historical;
  const trendsSource = report.sources.find((source) => source.name.includes("Trends"));
  const lead = benchmarkApartment && benchmarkHouse
    ? `One-bedroom apartment asking rents are ${benchmarkApartment.yearOverYearPct !== null && benchmarkApartment.yearOverYearPct < 0 ? "softening" : "holding modestly higher"}, while three-bedroom houses are ${benchmarkHouse.yearOverYearPct !== null && benchmarkHouse.yearOverYearPct >= 0 ? "rising" : "softening"}.`
    : report.marketRead.narrative;
  const headline = report.editorial?.headline || "A split rental market requires a local read";
  const introduction = report.editorial?.introduction || `${lead} Conditions differ by product and location, so the MSA headline is most useful when read alongside city and ZIP trends.`;
  const edition = report.editionComparison?.state !== "baseline" && report.editionComparison?.findings.length
    ? report.editionComparison
    : null;
  const companyProfile = report.editorial?.companyProfile;
  const companyCtaUrl = report.editorial?.companyCtaUrl;
  const companyCtaLabel = report.editorial?.companyCtaLabel || "Talk with our team";

  return <div role={preview ? undefined : "main"} style={reportStyle} className="min-h-screen bg-[#f7f6f2] text-slate-900">
    <header className={`${preview ? "relative" : "sticky top-0"} z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur`}><div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10"><div>{report.brand.logoUrl ? <Image src={report.brand.logoUrl} alt={report.brand.displayName} width={210} height={40} unoptimized className="max-h-10 max-w-[210px] object-contain object-left" /> : <p className="text-lg font-bold tracking-tight text-[var(--report-primary)]">{report.brand.displayName}</p>}<p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Interactive local market read</p></div><div className="flex items-center gap-4 text-right text-xs text-slate-500"><div className="hidden sm:block"><p>Rent data through {trendsSource?.availableThrough ?? report.scope.periodEnd}</p><p className="mt-1">Prepared {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}</p></div>{publicToken && !preview ? <a href={`/reports/market/${publicToken}/pdf`} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-600 hover:border-slate-500">PDF export</a> : <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-400">Preview</span>}</div></div></header>

    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
      <section className="grid gap-9 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--report-accent)]">{report.scope.marketName}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--report-primary)] sm:text-6xl">{headline}</h1><p className="mt-6 max-w-3xl whitespace-pre-line text-xl leading-8 text-slate-600">{introduction}</p></div><aside className="rounded-2xl bg-[var(--report-primary)] p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]"><p className="text-xs font-bold uppercase tracking-[0.17em] text-white/60">Current benchmarks</p><p className="mt-3 text-2xl font-semibold leading-8">{benchmarkApartment ? `${change(benchmarkApartment.yearOverYearPct, false)} 1-bed apartments` : "Apartment benchmark pending"}<br />{benchmarkHouse ? `${change(benchmarkHouse.yearOverYearPct, false)} 3-bed houses` : "House benchmark pending"}</p><p className="mt-4 text-sm leading-6 text-white/70">MSA asking-rent trends, {month(benchmarkApartment?.month ?? benchmarkHouse?.month ?? null)}.</p></aside></section>

      {msaRollups.length > 0 && <section className="mt-12 grid gap-5 lg:grid-cols-2">{msaRollups.map((cell) => <SummaryCard key={cell.key} cell={cell} />)}</section>}

      <section className="mt-14 rounded-3xl border border-slate-200 bg-white p-7 sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Three things to know</p><div className="mt-7 grid gap-8 lg:grid-cols-3"><article><p className="text-4xl font-semibold text-[var(--report-primary)]">01</p><h2 className="mt-4 text-xl font-semibold">Core segments are moving differently</h2><p className="mt-3 leading-7 text-slate-600">{benchmarkApartment && benchmarkHouse ? `One-bedroom apartments are ${change(benchmarkApartment.yearOverYearPct)}, compared with ${change(benchmarkHouse.yearOverYearPct)} for three-bedroom houses.` : "Apartment and house trajectories should be read by a current, supported bedroom segment."}</p></article><article><p className="text-4xl font-semibold text-[var(--report-primary)]">02</p><h2 className="mt-4 text-xl font-semibold">Local direction varies sharply</h2><p className="mt-3 leading-7 text-slate-600">{strongest && softest ? `${strongest.geographyLabel} ${strongest.label.toLowerCase()} lead at ${change(strongest.yearOverYearPct, false)}, while ${softest.geographyLabel} ${softest.label.toLowerCase()} are at ${change(softest.yearOverYearPct, false)}.` : "Supported city results show why the MSA average is only the beginning of the read."}</p></article><article><p className="text-4xl font-semibold text-[var(--report-primary)]">03</p><h2 className="mt-4 text-xl font-semibold">Supply is adding pressure</h2><p className="mt-3 leading-7 text-slate-600">{conditions ? `New-listing volume rose ${change(conditions.newListingsChange, false)} in the latest 30-day comparison, while median time on market reached ${Math.round(conditions.medianDom)} days.` : "Listing volume and velocity add context without being blended into rent statistics."}</p></article></div></section>

      {edition && <section className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="grid gap-5 border-b border-slate-100 bg-slate-50 px-7 py-7 sm:px-9 lg:grid-cols-[1fr_auto] lg:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Since the last market read</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{edition.heading}</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">{edition.narrative}</p></div><span className="h-fit rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-200">{edition.state}</span></div>{edition.findings.length > 0 && <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">{edition.findings.map((finding, index) => <article key={finding.id} className={`p-7 sm:p-9 ${index > 1 ? "lg:border-t lg:border-slate-100" : ""}`}><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${finding.importance === "high" ? "bg-orange-50 text-orange-800" : "bg-slate-100 text-slate-600"}`}>{finding.importance}</span><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{finding.geographyLabel}</span></div><h3 className="mt-4 text-lg font-semibold leading-7 text-[var(--report-primary)]">{finding.headline}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{finding.detail}</p></article>)}</div>}</section>}

      {report.competitiveSetBrief && <section className="mt-10 overflow-hidden rounded-3xl border border-violet-200 bg-white"><header className="grid gap-5 bg-violet-50 px-7 py-7 sm:px-9 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Competitive set evidence</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{report.competitiveSetBrief.watchlistName}</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">Selected observed activity within {report.competitiveSetBrief.radiusMiles} {report.competitiveSetBrief.radiusMiles === 1 ? "mile" : "miles"} of {report.competitiveSetBrief.centerLabel}.</p></div><div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-violet-100"><p className="font-semibold text-[var(--report-primary)]">{report.competitiveSetBrief.coverageDays}/{report.competitiveSetBrief.expectedDays} daily editions represented</p><p className="mt-1 text-xs">Source through {new Date(report.competitiveSetBrief.sourceAsOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: market?.timeZone ?? "America/New_York", timeZoneName: "short" })}</p></div></header><div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x">{report.competitiveSetBrief.findings.map((finding) => <article key={finding.key} className="p-7 sm:p-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-800">{COMPETITIVE_FINDING_LABELS[finding.eventType]}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${finding.isSubject ? "bg-[var(--report-primary)] text-white" : "bg-slate-100 text-slate-600"}`}>{finding.isSubject ? "Subject" : "Peer"}</span></div><h3 className="mt-4 text-lg font-semibold leading-7 text-[var(--report-primary)]">{finding.headline}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{finding.detail}</p><p className="mt-4 text-xs font-semibold text-slate-400">Observed {new Date(finding.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: market?.timeZone ?? "America/New_York", timeZoneName: "short" })}</p></article>)}</div><p className="border-t border-violet-100 bg-violet-50/60 px-7 py-4 text-xs leading-5 text-slate-500 sm:px-9">{report.competitiveSetBrief.disclosure}</p></section>}

      {report.marketActivity && <div className="mt-10"><MarketIqDailyEvents availability={report.marketActivity} marketName={market?.shortLabel ?? report.scope.marketName} timeZone={market?.timeZone ?? "America/New_York"} /></div>}
      {report.timeToResolution && <div className="mt-10"><MarketIqTimeToResolution availability={report.timeToResolution} marketName={market?.shortLabel ?? report.scope.marketName} timeZone={market?.timeZone ?? "America/New_York"} /></div>}

      <section className="mt-16"><div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Local market map</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">See how asking rents vary locally</h2></div><p className="max-w-2xl leading-7 text-slate-600 lg:justify-self-end">Switch between published asking rents and annual direction, then select a ZIP to view its three-year path, municipal comparison, MSA benchmark, nearby markets, and recent listing activity.</p></div><div className="mt-8"><MarketIqRentMap points={report.marketMap.points} benchmarks={reportable.filter((cell) => cell.geographyType === "msa")} cityCells={cityBenchmarkCells} activity={marketActivity} marketName={market?.fullName ?? report.scope.marketName} timeZone={market?.timeZone ?? "America/New_York"} boundaryUrl={`/data/${market?.slug ?? "cleveland"}-zcta.geojson`} /></div></section>

      <section className="mt-16"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Municipality view</p><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-3xl font-semibold tracking-tight text-[var(--report-primary)]">One product definition at every local level</h2><p className="mt-3 max-w-3xl leading-7 text-slate-600">Each municipality uses its latest one-bedroom apartment and three-bedroom house values. Every value carries its own observation month, and older all-product values are not mixed into this comparison.</p></div><p className="text-sm font-semibold text-slate-500">{supportedCities.length} municipalities · {cityBenchmarks.length} published reads</p></div><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{supportedCities.map((city) => <MunicipalityBenchmarkCard key={city} city={city} cells={cityBenchmarks.filter((cell) => cell.geographyLabel === city)} />)}</div>{withheldCities.length > 0 && <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white/60 px-5 py-4 text-sm leading-6 text-slate-500">No value is available for the selected benchmark products in: {withheldCities.join(", ")}.</p>}</section>

      <section className="mt-16 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"><article className="rounded-3xl bg-[var(--report-primary)] p-8 text-white sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Questions worth discussing</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">Connect local conditions to each property</h2><ul className="mt-6 space-y-4 text-base leading-7 text-white/80"><li>How does each property compare with the rent trend for its ZIP and product type?</li><li>Where are apartment asking rents softening enough to merit a pricing review?</li><li>Where are house rents holding despite changes in listing supply?</li></ul></article>{conditions && <article className="rounded-3xl border border-slate-200 bg-white p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Recent listing activity</p><dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"><div><dt className="text-sm text-slate-500">Active at cutoff</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{conditions.activeAtCutoff.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">New, 30 days</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{conditions.newListings30d.toLocaleString()}</dd></div><div><dt className="text-sm text-slate-500">New-listing change</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{change(conditions.newListingsChange, false)}</dd></div><div><dt className="text-sm text-slate-500">Median DOM</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{Math.round(conditions.medianDom)} days</dd></div></dl><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">Listing activity provides context and is not used to calculate rent.</p></article>}</section>

      <section className="mt-16 rounded-3xl border border-sky-200 bg-sky-50 p-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-800">Benchmark methodology</p><h2 className="mt-3 text-xl font-semibold text-[var(--report-primary)]">The headline uses current one-bedroom apartment and three-bedroom house trends</h2><p className="mt-3 max-w-4xl leading-7 text-slate-700">The MSA headline uses the July 2026 asking rents and published year-over-year changes for those two benchmark products. The broader apartment and house medians remain available for context, but they do not drive the headline.</p></section>

      {(companyProfile || companyCtaUrl) && <section className="mt-16 overflow-hidden rounded-3xl bg-[var(--report-primary)] text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]"><div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">About {report.brand.displayName}</p>{companyProfile && <p className="mt-4 max-w-3xl whitespace-pre-line text-lg leading-8 text-white/85">{companyProfile}</p>}{(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <p className="mt-5 text-sm leading-6 text-white/65">{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" · ")}</p>}</div>{companyCtaUrl && <a href={companyCtaUrl} target="_blank" rel="noreferrer" className="inline-flex h-fit items-center justify-center rounded-md bg-white px-5 py-3 text-sm font-bold text-[var(--report-primary)] hover:bg-white/90">{companyCtaLabel}</a>}</div></section>}

      <section className="mt-16 border-t border-slate-300 pt-8 text-sm leading-6 text-slate-500"><h2 className="font-semibold text-slate-800">Sources and methodology</h2><div className="mt-4 grid gap-5 sm:grid-cols-2">{report.sources.map((source) => <div key={`${source.name}:${source.availableThrough}`}><p className="font-semibold text-slate-700">{publicSourceName(source.name)}</p><p>Available through {source.availableThrough}{source.observationCount ? ` · ${source.observationCount.toLocaleString()} observations` : ""}</p><p>{publicSourceNote(source.note)}</p></div>)}</div><p className="mt-6">{publicSourceNote(report.methodNote)}</p><p className="mt-3">{report.disclosure}</p><div className="mt-9 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-700">Prepared by {report.brand.displayName}</p>{(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <p className="mt-1 text-xs">{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" · ")}</p>}</div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Market data by Dwellsy IQ</p></div></section>
    </div>
  </div>;
}
