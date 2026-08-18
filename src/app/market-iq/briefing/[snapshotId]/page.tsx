import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { compareMarketIqBriefingArchives, parseMarketIqBriefingArchivePayload } from "@/lib/market-iq/weekly-briefing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateLabel(value: string | Date | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "Awaiting source";
}

function money(value: number | null | undefined) {
  return value === null || value === undefined ? "Not available" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function signed(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "Not comparable" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function moneyDelta(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not comparable";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

export default async function MarketIqBriefingArchivePage({ params }: { params: Promise<{ snapshotId: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ snapshotId }, context, access] = await Promise.all([params, getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!context.organizationId) redirect("/setup-workspace");

  const currentRow = await prisma.marketIqBriefingSnapshot.findFirst({
    where: { id: snapshotId, organizationId: context.organizationId },
    select: { id: true, weekOf: true, payload: true, createdAt: true },
  });
  if (!currentRow) notFound();
  const current = parseMarketIqBriefingArchivePayload(currentRow.payload);
  if (!current) notFound();

  const [priorRow, newerRow] = await Promise.all([
    prisma.marketIqBriefingSnapshot.findFirst({
      where: { organizationId: context.organizationId, createdAt: { lt: currentRow.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true, weekOf: true },
    }),
    prisma.marketIqBriefingSnapshot.findFirst({
      where: { organizationId: context.organizationId, createdAt: { gt: currentRow.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true, weekOf: true },
    }),
  ]);
  const prior = priorRow ? parseMarketIqBriefingArchivePayload(priorRow.payload) : null;
  const comparison = compareMarketIqBriefingArchives(current, prior);
  const marketNames = new Map([
    ...current.currentMoves.map((item) => [item.marketId, item.marketName] as const),
    ...current.reviews.map((item) => [item.marketId, item.marketName] as const),
    ...current.exceptions.map((item) => [item.marketId, item.marketName] as const),
  ]);

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <nav className="mb-7 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href="/market-iq/briefing" className="hover:text-teal-700">Weekly briefing</Link><span>/</span><span>Week of {dateLabel(current.weekOf)}</span></nav>
    <header className="grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_390px] lg:items-end">
      <div><p className="dq-eyebrow">Frozen weekly briefing</p><h1 className="dq-h1">Week of {dateLabel(current.weekOf)}</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">{current.headline}</p><p className="mt-3 text-xs text-slate-500">Frozen {dateLabel(current.preparedAt)}. This record preserves the evidence available at that time and does not change when live sources advance.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Compared with</p><p className="mt-3 text-xl font-semibold">{prior ? `Week of ${dateLabel(prior.weekOf)}` : "First frozen briefing"}</p><p className="mt-3 text-sm leading-6 text-white/70">{prior ? "Changes below compare two frozen records, not a live source refresh." : "Freeze another week to begin week-over-week comparison."}</p></aside>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Markets", current.counts.markets, comparison?.countChanges.markets],
        ["Current sources", current.counts.currentSources, comparison?.countChanges.currentSources],
        ["Drafts to review", current.counts.reviews, comparison?.countChanges.reviews],
        ["Exceptions", current.counts.exceptions, comparison?.countChanges.exceptions],
      ].map(([label, value, delta]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-navy">{value}</p><p className="mt-1 text-xs text-slate-500">{comparison ? `${Number(delta) >= 0 ? "+" : ""}${delta} from prior frozen week` : "No prior frozen week"}</p></article>)}
    </section>

    <section className="mt-8 grid gap-7 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-7">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-6 sm:px-8"><p className="dq-eyebrow">Market movement</p><h2 className="dq-h2">What changed between frozen weeks</h2><p className="mt-2 text-sm leading-6 text-slate-600">Matched on market, geography, and product segment. Rent and direction remain aggregated Trends IQ values with their archived source periods.</p></div>
          {comparison?.moveChanges.length ? <div className="divide-y divide-slate-100">{comparison.moveChanges.map((move) => <article key={`${move.marketId}-${move.geographyLabel}-${move.segmentLabel}`} className="grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[1fr_auto_auto] lg:items-center"><div><p className="text-sm font-semibold text-navy">{move.marketName}: {move.geographyLabel}</p><p className="mt-1 text-xs text-slate-500">{move.segmentLabel} · source through {dateLabel(move.sourcePeriodEnd)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Asking rent</p><p className="mt-1 text-lg font-semibold text-navy">{money(move.rent)} <span className="text-xs text-slate-500">{moneyDelta(move.rentChange)}</span></p></div><div className="lg:text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">YoY direction</p><p className={`mt-1 text-lg font-semibold ${(move.yearOverYearPct ?? 0) >= 0 ? "text-teal-700" : "text-orange-700"}`}>{signed(move.yearOverYearPct, "%")} <span className="text-xs text-slate-500">{signed(move.directionChange, " pts")}</span></p></div></article>)}</div> : <div className="px-6 py-9 sm:px-8"><p className="text-sm leading-6 text-slate-600">{prior ? "No matching market, geography, and segment appeared in both frozen weeks." : "A prior frozen week is required for comparison."}</p></div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-6 sm:px-8"><p className="dq-eyebrow">Edition review</p><h2 className="dq-h2">Private drafts captured this week</h2></div>{current.reviews.length ? <div className="divide-y divide-slate-100">{current.reviews.map((review) => <article key={review.marketId} className="px-6 py-6 sm:px-8"><div className="flex flex-wrap items-baseline justify-between gap-3"><p className="text-lg font-semibold text-navy">{review.marketName}</p><p className="text-sm font-semibold text-orange-700">{review.materialChangeCount} material changes</p></div><p className="mt-2 text-xs text-slate-500">Edition through {dateLabel(review.periodEnd)}</p><div className="mt-4 space-y-3">{review.findings.map((finding) => <div key={finding.id}><p className="text-sm font-semibold text-navy">{finding.headline}</p><p className="mt-1 text-xs leading-5 text-slate-500">{finding.detail}</p></div>)}</div></article>)}</div> : <p className="px-6 py-9 text-sm text-slate-600 sm:px-8">No private edition draft was waiting for review in this frozen week.</p>}</section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Exception changes</p><h2 className="mt-2 text-xl font-semibold text-navy">Added and resolved</h2>{comparison ? <div className="mt-5 space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Added</p>{comparison.addedExceptions.length ? comparison.addedExceptions.map((item) => <p key={`${item.marketId}-${item.kind}`} className="mt-2 text-sm text-slate-700">{item.marketName}: {item.kind === "setup" ? "market setup needed" : "source unavailable"}</p>) : <p className="mt-2 text-sm text-slate-500">None</p>}</div><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Resolved</p>{comparison.resolvedExceptions.length ? comparison.resolvedExceptions.map((item) => <p key={`${item.marketId}-${item.kind}`} className="mt-2 text-sm text-slate-700">{item.marketName}: {item.kind === "setup" ? "market setup completed" : "source restored"}</p>) : <p className="mt-2 text-sm text-slate-500">None</p>}</div></div> : <p className="mt-4 text-sm leading-6 text-slate-600">No prior frozen week is available.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Source periods</p><h2 className="mt-2 text-xl font-semibold text-navy">Evidence preserved</h2><div className="mt-5 space-y-3">{Object.entries(current.sourcePeriods).map(([marketId, period]) => <div key={marketId} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0"><p className="text-sm font-semibold text-navy">{marketNames.get(marketId) ?? marketId}</p><p className="text-xs text-slate-500">{period ? dateLabel(period) : "Awaiting source"}</p></div>)}</div></section>
        <section className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Private archive</p><p className="mt-3 text-lg font-semibold">This briefing is internal.</p><p className="mt-2 text-sm leading-6 text-white/70">It cannot publish a client report or send email. Client Advisory remains a separate reviewed workflow.</p></section>
      </aside>
    </section>

    <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-grid pt-6"><div>{priorRow && <Link href={`/market-iq/briefing/${priorRow.id}`} className="text-sm font-semibold text-teal-700">← Prior frozen week</Link>}</div><div>{newerRow && <Link href={`/market-iq/briefing/${newerRow.id}`} className="text-sm font-semibold text-teal-700">Newer frozen week →</Link>}</div></footer>
  </main>;
}
