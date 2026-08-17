"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";

import { MarketIqActivityTicker } from "@/components/market-iq/report/MarketIqActivityTicker";
import { MarketIqRentMap, type MarketIqMapSegment } from "@/components/market-iq/report/MarketIqRentMap";
import type { MarketIqGeographyType, MarketIqMarketCell, MarketIqReportSnapshot, MarketIqTrendPoint } from "@/lib/market-iq/report/report";

type ListingSync = {
  status: "healthy" | "unavailable";
  availableThrough: string | null;
  activeListings: number;
  newEvents: number;
  relistedEvents: number;
  priceChangeEvents: number;
  message: string;
};

const BENCHMARK_SEGMENTS: MarketIqMapSegment[] = [
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "apartment", bedrooms: 2, label: "2-bed apartments" },
  { propertyType: "house", bedrooms: 2, label: "2-bed houses" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

function money(value: number | null) {
  if (value === null) return "Not available";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number | null) {
  if (value === null) return "No YoY value";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function month(value: string | null) {
  if (!value) return "Date unavailable";
  return new Date(`${value.slice(0, 7)}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function directionClass(value: number | null) {
  if (value === null || Math.abs(value) < 1) return "bg-slate-100 text-slate-600";
  return value > 0 ? "bg-teal-50 text-teal-800" : "bg-orange-50 text-orange-800";
}

function TrendLine({ points }: { points: MarketIqTrendPoint[] }) {
  if (points.length < 2) return <div className="grid h-28 place-items-center rounded-xl bg-slate-50 text-xs text-slate-400">Trend history is limited</div>;
  const values = points.map((point) => point.rent);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(1, high - low);
  const width = 360;
  const height = 112;
  const coordinates = points.map((point, index) => ({
    x: 12 + (index * (width - 24)) / Math.max(1, points.length - 1),
    y: 14 + ((high - point.rent) / range) * (height - 32),
    point,
  }));
  return <div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label="Twelve-month asking-rent trajectory">
      <line x1="12" y1={height - 10} x2={width - 12} y2={height - 10} stroke="#e2e8f0" strokeWidth="1" />
      <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#1b6e8c" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map(({ x, y, point }, index) => <circle key={point.month} cx={x} cy={y} r={index === coordinates.length - 1 ? 5 : 3} fill="#0f1f3f" stroke="#fff" strokeWidth="2" />)}
    </svg>
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><span>{month(points[0]?.month ?? null)}</span><span>{month(points.at(-1)?.month ?? null)}</span></div>
  </div>;
}

function BenchmarkCard({ cell }: { cell: MarketIqMarketCell }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{cell.label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{money(cell.rent)}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${directionClass(cell.yearOverYearPct)}`}>{percentage(cell.yearOverYearPct)}</span>
    </div>
    <div className="mt-4"><TrendLine points={cell.series} /></div>
    <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Cleveland-Elyria MSA · {month(cell.month)}</p>
  </article>;
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-navy">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </article>;
}

export function MarketIqIntelligenceWorkspace({ report, listingSync, clientAdvisoryEnabled }: { report: MarketIqReportSnapshot; listingSync: ListingSync; clientAdvisoryEnabled: boolean }) {
  const reportable = report.marketRead.cells.filter((cell) => cell.status === "reportable" && cell.rent !== null);
  const msaCells = reportable.filter((cell) => cell.geographyType === "msa");
  const cityCells = reportable.filter((cell) => cell.geographyType === "city");
  const zipCells = reportable.filter((cell) => cell.geographyType === "zip");
  const benchmarkCells = BENCHMARK_SEGMENTS.flatMap((segment) => {
    const cell = msaCells.find((candidate) => candidate.propertyType === segment.propertyType && candidate.bedrooms === segment.bedrooms);
    return cell ? [cell] : [];
  });
  const directional = reportable.filter((cell) => cell.yearOverYearPct !== null);
  const largestMove = [...directional].sort((a, b) => Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0))[0] ?? null;
  const rising = directional.filter((cell) => (cell.yearOverYearPct ?? 0) >= 1).length;
  const softening = directional.filter((cell) => (cell.yearOverYearPct ?? 0) <= -1).length;
  const supportedCities = new Set(cityCells.map((cell) => cell.geographyLabel)).size;
  const supportedZips = new Set(zipCells.map((cell) => cell.geographyValue)).size;
  const latestMonth = reportable.map((cell) => cell.month).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

  const [geographyType, setGeographyType] = useState<Extract<MarketIqGeographyType, "city" | "zip">>("city");
  const [segmentKey, setSegmentKey] = useState("apartment:1");
  const [sortMode, setSortMode] = useState<"movers" | "rent">("movers");
  const [showAll, setShowAll] = useState(false);
  const [propertyType, bedroomsValue] = segmentKey.split(":");
  const bedrooms = Number(bedroomsValue);
  const localRows = (geographyType === "city" ? cityCells : zipCells)
    .filter((cell) => cell.propertyType === propertyType && cell.bedrooms === bedrooms)
    .sort((a, b) => sortMode === "rent" ? (b.rent ?? 0) - (a.rent ?? 0) : Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0));
  const visibleRows = showAll ? localRows : localRows.slice(0, 12);
  const maxRent = Math.max(1, ...localRows.map((cell) => cell.rent ?? 0));
  const activitySource = report.sources.find((source) => source.name.includes("listing activity feed"));
  const conditions = report.marketConditions.historical;

  return <main style={{ "--report-primary": "#17324a", "--report-accent": "#c16f36" } as CSSProperties} className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <header className="overflow-hidden rounded-3xl bg-navy text-white shadow-[0_24px_70px_rgba(15,31,63,0.18)]">
      <div className="grid gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[1fr_340px] lg:items-end lg:px-12">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">Internal market intelligence</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Cleveland-Elyria rental market</h1><p className="mt-4 max-w-3xl text-base leading-7 text-white/72">Explore asking-rent direction across the MSA, municipalities, ZIPs, and product segments. Use this workspace for analysis, then decide what belongs in a client report.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-white/75"><a href="#trajectories" className="rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Trajectories</a><a href="#local-map" className="rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">ZIP map</a><a href="#local-ranking" className="rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Local ranking</a><a href="#sources" className="rounded-full border border-white/20 px-3 py-2 hover:bg-white/10">Sources</a></div>
        </div>
        <aside className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Latest Trends month</p><p className="mt-2 text-3xl font-semibold">{month(latestMonth)}</p><p className="mt-3 text-sm leading-6 text-white/65">Rent levels and changes on this page come directly from Dwellsy Trends.</p>{clientAdvisoryEnabled ? <Link href="/market-iq/report?from=market-read" className="mt-5 block rounded-lg bg-white px-4 py-3 text-center text-sm font-bold text-navy hover:bg-white/90">Create a client edition</Link> : <Link href="/market-iq/subscribe?upgrade=client_advisory" className="mt-5 block rounded-lg bg-white px-4 py-3 text-center text-sm font-bold text-navy hover:bg-white/90">Add client reporting</Link>}</aside>
      </div>
    </header>

    <section aria-label="Market summary" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryMetric label="Municipality coverage" value={`${supportedCities} cities`} detail="with at least one current Trends value" /><SummaryMetric label="ZIP coverage" value={`${supportedZips} ZIPs`} detail="with at least one current Trends value" /><SummaryMetric label="Local direction" value={`${rising} up · ${softening} down`} detail="across current city and ZIP segment values" /><SummaryMetric label="Largest current move" value={largestMove ? percentage(largestMove.yearOverYearPct) : "Not available"} detail={largestMove ? `${largestMove.geographyLabel} · ${largestMove.label}` : "No year-over-year values available"} /></section>

    {report.marketActivity && report.marketActivity.events.length > 0 && <section className="mt-8"><MarketIqActivityTicker activity={report.marketActivity} /></section>}

    <section id="trajectories" className="mt-12 scroll-mt-28"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="dq-eyebrow">MSA trajectories</p><h2 className="dq-h2">Apartments and houses are not moving together</h2></div><p className="max-w-2xl text-sm leading-6 text-slate-500">Each chart shows the stored monthly asking-rent path for one consistent product definition. The cards are analytical benchmarks, not property-level rent recommendations.</p></div><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{benchmarkCells.map((cell) => <BenchmarkCard key={cell.key} cell={cell} />)}</div></section>

    <section id="local-map" className="mt-14 scroll-mt-28"><div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr] lg:items-end"><div><p className="dq-eyebrow">Geographic intelligence</p><h2 className="dq-h2">See where rent direction diverges</h2></div><p className="max-w-2xl text-sm leading-6 text-slate-500 lg:justify-self-end">Change the product and measure, then select a shaded ZIP for its trajectory, municipality comparison, MSA benchmark, nearby markets, and recent listing activity.</p></div><div className="mt-6 rounded-3xl border border-slate-200 bg-[#f7f8f6] p-4 shadow-sm sm:p-6"><MarketIqRentMap points={report.marketMap.points} benchmarks={msaCells} cityCells={cityCells} activity={report.marketActivity} segments={BENCHMARK_SEGMENTS} /></div></section>

    <section id="local-ranking" className="mt-14 scroll-mt-28"><div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]"><div><p className="dq-eyebrow">Local comparison</p><h2 className="dq-h2">Find the markets moving furthest</h2><p className="mt-4 text-sm leading-6 text-slate-500">Choose one product and compare it consistently across municipalities or ZIPs. Sort by year-over-year movement to find change, or by asking rent to understand price position.</p>
      <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5"><label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Geography<select value={geographyType} onChange={(event) => { setGeographyType(event.target.value as "city" | "zip"); setShowAll(false); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value="city">Municipalities</option><option value="zip">ZIP codes</option></select></label><label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Product<select value={segmentKey} onChange={(event) => { setSegmentKey(event.target.value); setShowAll(false); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy">{BENCHMARK_SEGMENTS.map((segment) => <option key={`${segment.propertyType}:${segment.bedrooms}`} value={`${segment.propertyType}:${segment.bedrooms}`}>{segment.label}</option>)}</select></label><div><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Sort by</p><div className="mt-2 flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => setSortMode("movers")} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${sortMode === "movers" ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}>Largest moves</button><button type="button" onClick={() => setSortMode("rent")} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${sortMode === "rent" ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}>Highest rent</button></div></div></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4"><div><p className="font-semibold text-navy">{geographyType === "city" ? "Municipality" : "ZIP"} ranking</p><p className="mt-1 text-xs text-slate-500">{localRows.length} current Trends values</p></div><p className="text-xs font-semibold text-slate-400">{month(localRows[0]?.month ?? null)}</p></div><div className="divide-y divide-slate-100">{visibleRows.map((cell, index) => <article key={cell.key} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><div className="min-w-0"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-navy">{cell.geographyLabel}</p><p className="text-sm font-semibold tabular-nums text-navy">{money(cell.rent)}</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(4, ((cell.rent ?? 0) / maxRent) * 100)}%` }} /></div></div><span className={`min-w-[70px] rounded-full px-2.5 py-1 text-center text-xs font-bold tabular-nums ${directionClass(cell.yearOverYearPct)}`}>{percentage(cell.yearOverYearPct)}</span></article>)}{!visibleRows.length && <p className="px-5 py-10 text-center text-sm text-slate-500">No Trends value is available for this selection.</p>}</div>{localRows.length > 12 && <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full border-t border-slate-100 px-5 py-3 text-sm font-semibold text-teal-700 hover:bg-slate-50">{showAll ? "Show the first 12" : `Show all ${localRows.length}`}</button>}</div>
    </div></section>

    <section className="mt-14 grid gap-5 lg:grid-cols-2"><article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Listing context</p><h2 className="dq-h2">{conditions ? report.marketConditions.heading : "Current listing context is unavailable"}</h2>{conditions ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Active at cutoff</p><p className="mt-1 text-2xl font-semibold text-navy">{conditions.activeAtCutoff.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">New, 30 days</p><p className="mt-1 text-2xl font-semibold text-navy">{conditions.newListings30d.toLocaleString()}</p></div><div><p className="text-xs text-slate-500">30-day change</p><p className="mt-1 text-2xl font-semibold text-navy">{percentage(conditions.newListingsChange)}</p></div><div><p className="text-xs text-slate-500">Median DOM</p><p className="mt-1 text-2xl font-semibold text-navy">{Math.round(conditions.medianDom)} days</p></div></div> : <p className="mt-4 text-sm leading-6 text-slate-500">No historical listing snapshot is substituted.</p>}<p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Listing measures provide market context. They are never used to calculate aggregated rent.</p></article>
      <article className={`rounded-2xl border p-6 shadow-sm ${listingSync.status === "healthy" ? "border-teal-200 bg-teal-50" : "border-orange-200 bg-orange-50"}`}><p className="dq-eyebrow">Listing synchronization</p><h2 className="dq-h2">{listingSync.status === "healthy" ? "Current listing feed is connected" : "Current listing snapshot is pending"}</h2><p className="mt-4 text-sm leading-6 text-slate-600">{listingSync.message}</p>{listingSync.status === "healthy" && <div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-2xl font-semibold text-navy">{listingSync.activeListings.toLocaleString()}</p><p className="text-xs text-slate-500">active listings</p></div><div><p className="text-2xl font-semibold text-navy">{(listingSync.newEvents + listingSync.relistedEvents).toLocaleString()}</p><p className="text-xs text-slate-500">new or relisted</p></div><div><p className="text-2xl font-semibold text-navy">{listingSync.priceChangeEvents.toLocaleString()}</p><p className="text-xs text-slate-500">price changes</p></div></div>}{activitySource && <p className="mt-5 border-t border-current/10 pt-4 text-xs text-slate-500">Recent activity source through {activitySource.availableThrough}.</p>}</article>
    </section>

    <section id="sources" className="mt-14 scroll-mt-28 border-t border-slate-200 pt-8"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="dq-eyebrow">Sources and limits</p><h2 className="dq-h2">Know what each number represents</h2></div><p className="max-w-2xl text-sm leading-6 text-slate-500">This is asking-market intelligence. It does not represent occupancy, signed leases, concessions, effective rent, or property financial performance.</p></div><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{report.sources.map((source) => <article key={`${source.name}:${source.availableThrough}`} className="rounded-xl border border-slate-200 bg-white p-5"><p className="font-semibold text-navy">{source.name}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Available through {source.availableThrough}</p><p className="mt-3 text-sm leading-6 text-slate-600">{source.note}</p></article>)}</div></section>
  </main>;
}
