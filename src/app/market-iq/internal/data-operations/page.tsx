import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { loadMarketIqDataOperations } from "@/lib/market-iq/data-operations.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  current: "bg-emerald-50 text-emerald-800",
  healthy: "bg-emerald-50 text-emerald-800",
  stale: "bg-amber-100 text-amber-900",
  attention: "bg-amber-100 text-amber-900",
  missing: "bg-rose-100 text-rose-900",
  blocked: "bg-rose-100 text-rose-900",
  failed: "bg-rose-100 text-rose-900",
};

function formatDate(value: Date | null | undefined, includeTime = false) {
  if (!value) return "Not recorded";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "UTC",
    ...(includeTime ? { timeZoneName: "short" } : {}),
  });
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLE[value] ?? "bg-slate-100 text-slate-700"}`}>{value}</span>;
}

export default async function MarketIqDataOperationsPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();
  const operations = await loadMarketIqDataOperations();

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq/internal/admin">Market IQ admin</Link><span>/</span><Link href="/market-iq/internal/readiness">Launch readiness</Link><span>/</span><span>Data operations</span></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Dwellsy internal</p><h1 className="dq-h1">Market IQ data operations</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Daily ingestion coverage for the 25-market history cohort, plus detailed feed and report evidence for the four launched markets.</p></div><aside className={`rounded-2xl p-6 ${operations.status === "healthy" ? "bg-navy text-white" : "bg-amber-100 text-amber-950"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">Nightly data health</p><p className="mt-3 text-3xl font-semibold">{operations.currentMarkets} / {operations.trackedMarketCount}</p><p className="mt-2 text-sm leading-6 opacity-75">markets have a current eligible daily observation. Checked {formatDate(operations.checkedAt, true)}.</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Tracked markets" value={operations.trackedMarketCount} detail="Explicit first cohort" /><Metric label="Current today" value={operations.currentMarkets} detail="Eligible daily observations" /><Metric label={`Missing · ${operations.historyDays} days`} value={operations.missingObservations} detail="Market-day gaps" /><Metric label="Launched feeds current" value={operations.launchedMarkets.filter((market) => market.feedStatus === "current").length} detail={`of ${operations.launchedMarkets.length} detailed feeds`} /></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Seven-day coverage</p><h2 className="dq-h2">Was every market captured every night?</h2></div><div className="grid gap-px bg-slate-200 sm:grid-cols-7">{operations.dailyCoverage.map((day) => <article key={day.date} className="bg-white p-5"><p className="text-xs font-semibold text-slate-500">{day.date}</p><p className="mt-3 text-2xl font-semibold text-navy">{day.eligible} / {operations.trackedMarketCount}</p><p className="mt-1 text-xs text-slate-500">eligible · {day.observed} observed</p></article>)}</div></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Selected cohort</p><h2 className="dq-h2">25-market daily supply history</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3">Market</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Latest day</th><th className="px-4 py-3">Source through</th><th className="px-4 py-3 text-right">Active</th><th className="px-4 py-3 text-right">Days present</th><th className="px-6 py-3">Missing dates</th></tr></thead><tbody className="divide-y divide-slate-100">{operations.trackedMarkets.map((market) => <tr key={market.cbsaCode}><td className="px-6 py-4"><p className="font-semibold text-navy">{market.name}, {market.state}</p><p className="mt-1 text-xs text-slate-400">CBSA {market.cbsaCode}</p></td><td className="px-4 py-4"><Status value={market.status} /></td><td className="px-4 py-4 text-slate-600">{market.latestSnapshotDate ?? "None"}</td><td className="px-4 py-4 text-slate-600">{formatDate(market.sourceAvailableThrough, true)}</td><td className="px-4 py-4 text-right font-semibold tabular-nums text-navy">{market.activeListings?.toLocaleString() ?? "—"}</td><td className="px-4 py-4 text-right tabular-nums text-slate-600">{market.observedDays} / {operations.historyDays}</td><td className="px-6 py-4 text-xs text-slate-500">{market.missingDates.join(", ") || "None"}</td></tr>)}</tbody></table></div></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Launched markets</p><h2 className="dq-h2">Detailed listing feeds</h2></div><div className="divide-y divide-slate-100">{operations.launchedMarkets.map((market) => <article key={market.id} className="px-6 py-5"><div className="flex items-center justify-between gap-4"><p className="font-semibold text-navy">{market.name}</p><Status value={market.feedStatus} /></div><p className="mt-3 text-xs leading-5 text-slate-500">Feed: {market.latestFeed ? `${market.latestFeed.status}, ${market.latestFeed.recordCount.toLocaleString()} records at ${formatDate(market.latestFeed.completedAt ?? market.latestFeed.startedAt, true)}` : "not recorded"}. Report snapshot: {market.latestReport ? `generated ${formatDate(market.latestReport.generatedAt, true)}` : "not recorded"}.</p></article>)}</div></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Run ledger</p><h2 className="dq-h2">Recent detailed captures</h2></div><div className="divide-y divide-slate-100">{operations.recentFeedRuns.map((run) => <article key={run.id} className="grid gap-3 px-6 py-4 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold text-navy">{run.marketId}</p><p className="mt-1 text-xs text-slate-500">{run.triggerKind} · started {formatDate(run.startedAt, true)} · {run.recordCount.toLocaleString()} records</p>{run.error && <p className="mt-2 text-xs leading-5 text-rose-700">{run.error.slice(0, 240)}</p>}</div><Status value={run.status === "complete" || run.status === "baseline_complete" ? "current" : run.status} /></article>)}</div></div></section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Data boundary</p><p className="mt-2 text-sm leading-6 text-slate-600">This panel is read-only. The 25-market table reads compact daily aggregates from the isolated Market IQ analytical database. Detailed listing records and event comparisons remain limited to launched markets, and the source Dwellsy database is always accessed read-only by the nightly loaders.</p></section>
  </main>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-navy">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>;
}

