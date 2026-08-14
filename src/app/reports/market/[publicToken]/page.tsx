import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicMarketIqReport } from "@/lib/market-iq/report/build.server";
import type { MarketIqReportCell } from "@/lib/market-iq/report/report";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ publicToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) return { title: "Market report" };
  return {
    title: { absolute: `${report.brand.displayName} | ${report.scope.marketName} market report` },
    description: `A private market advisory prepared by ${report.brand.displayName}.`,
    icons: { icon: report.brand.logoUrl ?? "/market-report-icon.svg" },
    robots: { index: false, follow: false },
  };
}

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function position(value: number | null) {
  if (value === null) return "Not published";
  if (Math.abs(value) < 0.05) return "In line with market";
  return `${Math.abs(value).toFixed(1)}% ${value > 0 ? "above" : "below"} market`;
}

function SegmentCard({ cell }: { cell: MarketIqReportCell }) {
  if (cell.status === "suppressed") {
    return (
      <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{cell.label}</p>
        <p className="mt-5 text-xl font-semibold text-slate-700">Not published</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{cell.suppressionReason}</p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{cell.label}</p>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">
        {money(cell.portfolio.medianAskingRent)}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--report-accent)]">{position(cell.positionPct)}</p>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm">
        <div>
          <p className="text-slate-500">Market median</p>
          <p className="mt-1 font-semibold text-slate-800">{money(cell.market.medianAskingRent)}</p>
        </div>
        <div>
          <p className="text-slate-500">Sample</p>
          <p className="mt-1 font-semibold text-slate-800">{cell.portfolio.observations} portfolio · {cell.market.observations} market</p>
        </div>
      </div>
    </article>
  );
}

export default async function PublicMarketReportPage({ params }: PageProps) {
  const { publicToken } = await params;
  const report = await loadPublicMarketIqReport(publicToken);
  if (!report) notFound();

  const reportableSubmarkets = report.portfolioPosition.submarkets.filter((cell) => cell.status === "reportable");
  const suppressedSubmarkets = report.portfolioPosition.submarkets.filter((cell) => cell.status === "suppressed");
  const reportStyle = {
    "--report-primary": report.brand.primaryColor,
    "--report-accent": report.brand.accentColor,
  } as CSSProperties;

  return (
    <main style={reportStyle} className="min-h-screen bg-[#f7f6f2] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
          <div>
            {report.brand.logoUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={report.brand.logoUrl} alt={report.brand.displayName} className="max-h-12 max-w-[220px] object-contain object-left" />
            </> : <p className="text-xl font-bold tracking-tight text-[var(--report-primary)]">{report.brand.displayName}</p>}
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Market advisory</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>{report.scope.periodStart} to {report.scope.periodEnd}</p>
            <p className="mt-1">Prepared {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            <a href={`/reports/market/${publicToken}/pdf`} className="mt-3 inline-flex rounded-md bg-[var(--report-primary)] px-3 py-2 text-xs font-semibold text-white">Download PDF</a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10 lg:py-16">
        <section className="grid gap-10 lg:grid-cols-[1.45fr_0.55fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--report-accent)]">{report.scope.marketName}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-[var(--report-primary)] sm:text-6xl">
              Your portfolio’s position in the asking market
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">{report.portfolioPosition.narrative}</p>
          </div>
          <aside className="rounded-2xl bg-[var(--report-primary)] p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-white/70">Portfolio scope</p>
            <p className="mt-4 text-3xl font-semibold">{report.scope.propertyCount} communities</p>
            <p className="mt-2 text-sm leading-6 text-white/75">{report.scope.observedUnits} observed advertised units across {report.scope.submarkets.length} Cleveland submarkets.</p>
          </aside>
        </section>

        <section className="mt-16">
          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Portfolio position</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">Advertised rents by bedroom segment</h2>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">Portfolio medians are compared with external apartment listings observed in the ZIP codes where the portfolio operates.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {report.portfolioPosition.portfolioWide.map((cell) => <SegmentCard key={cell.key} cell={cell} />)}
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-9">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Submarket detail</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">Where positioning differs</h2>
            </div>
            <p className="text-sm text-slate-500">Only statistically supported cells are published.</p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-4 font-bold">Submarket</th>
                  <th className="px-3 py-4 font-bold">Segment</th>
                  <th className="px-3 py-4 font-bold">Portfolio median</th>
                  <th className="px-3 py-4 font-bold">Market median</th>
                  <th className="px-3 py-4 font-bold">Position</th>
                  <th className="px-3 py-4 font-bold">Observations</th>
                </tr>
              </thead>
              <tbody>
                {reportableSubmarkets.map((cell) => (
                  <tr key={cell.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-5 font-semibold text-[var(--report-primary)]">{cell.geographyLabel}</td>
                    <td className="px-3 py-5 text-slate-700">{cell.label}</td>
                    <td className="px-3 py-5 font-semibold">{money(cell.portfolio.medianAskingRent)}</td>
                    <td className="px-3 py-5 text-slate-700">{money(cell.market.medianAskingRent)}</td>
                    <td className="px-3 py-5 font-semibold text-[var(--report-accent)]">{position(cell.positionPct)}</td>
                    <td className="px-3 py-5 text-sm text-slate-500">{cell.portfolio.observations} / {cell.market.observations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {suppressedSubmarkets.length > 0 && (
            <details className="mt-6 rounded-xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-800">{suppressedSubmarkets.length} thin-sample cells not published</summary>
              <ul className="mt-3 space-y-2">
                {suppressedSubmarkets.map((cell) => (
                  <li key={cell.key}>{cell.geographyLabel}, {cell.label}: {cell.suppressionReason}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-3xl bg-[var(--report-primary)] p-8 text-white sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Market context</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">{report.marketConditions.heading}</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/80">{report.marketConditions.narrative}</p>
          </article>
          {report.marketConditions.historical && (
            <article className="rounded-3xl border border-slate-200 bg-white p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">At the export cutoff</p>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                <div><dt className="text-sm text-slate-500">Active listings</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.activeAtCutoff.toLocaleString()}</dd></div>
                <div><dt className="text-sm text-slate-500">New, 30 days</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{report.marketConditions.historical.newListings30d.toLocaleString()}</dd></div>
                <div><dt className="text-sm text-slate-500">Median DOM</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">{Math.round(report.marketConditions.historical.medianDom)} days</dd></div>
                <div><dt className="text-sm text-slate-500">Median rent / sf</dt><dd className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">${report.marketConditions.historical.medianRentPerSqFt.toFixed(2)}</dd></div>
              </dl>
            </article>
          )}
        </section>

        {report.marketConditions.trendSegments.length > 0 && (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--report-accent)]">Asking-rent trends</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {report.marketConditions.trendSegments.map((segment) => (
                <div key={segment.label} className="rounded-2xl bg-slate-50 p-5">
                  <p className="font-semibold text-[var(--report-primary)]">{segment.label}</p>
                  <p className="mt-3 text-2xl font-semibold">{money(segment.rent)}</p>
                  <p className="mt-1 text-sm text-slate-600">{segment.yoy >= 0 ? "+" : ""}{segment.yoy.toFixed(1)}% year over year · {segment.observations} observations</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-16 border-t border-slate-300 pt-8 text-sm leading-6 text-slate-500">
          <h2 className="font-semibold text-slate-800">Sources and methodology</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {report.sources.map((source) => (
              <div key={`${source.name}:${source.availableThrough}`}>
                <p className="font-semibold text-slate-700">{source.name}</p>
                <p>Available through {source.availableThrough}{source.observationCount ? ` · ${source.observationCount.toLocaleString()} source records` : ""}</p>
                <p>{source.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-6">{report.methodNote}</p>
          <p className="mt-3">{report.disclosure}</p>
          <div className="mt-9 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-slate-700">Prepared by {report.brand.displayName}</p>{(report.brand.contactName || report.brand.contactEmail || report.brand.contactPhone) && <p className="mt-1 text-xs text-slate-500">{[report.brand.contactName, report.brand.contactEmail, report.brand.contactPhone].filter(Boolean).join(" · ")}</p>}</div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Market data by Dwellsy IQ</p>
          </div>
        </section>
      </div>
    </main>
  );
}
