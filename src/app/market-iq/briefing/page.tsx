import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseMarketIqBriefingArchivePayload } from "@/lib/market-iq/weekly-briefing";
import { loadMarketIqWeeklyBriefing } from "@/lib/market-iq/weekly-briefing.server";
import { prisma } from "@/lib/prisma";
import { freezeMarketIqWeeklyBriefing } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function monthLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    : "Awaiting source";
}

function dateLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "None yet";
}

function rent(value: number | null | undefined) {
  return value === null || value === undefined ? "Not available" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function signed(value: number | null | undefined) {
  return value === null || value === undefined ? "No year-over-year read" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}% YoY`;
}

export default async function MarketIqBriefingPage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [access, context] = await Promise.all([resolveViewerMarketIqAccess(), getActiveOrgContext()]);
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!context.organizationId) redirect("/setup-workspace");

  const [loaded, archiveRows, params] = await Promise.all([
    loadMarketIqWeeklyBriefing({
      organizationId: context.organizationId,
      entitlement: access.entitlement,
      clientAdvisoryEnabled: access.capabilities.publishClientReports,
    }),
    prisma.marketIqBriefingSnapshot.findMany({
      where: { organizationId: context.organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, weekOf: true, payload: true, createdAt: true },
    }),
    searchParams ?? Promise.resolve({} as { saved?: string }),
  ]);
  if (!loaded) redirect("/setup-workspace");
  if (!loaded.briefing.marketCount) redirect("/market-iq/subscribe");
  const { briefing } = loaded;
  const archives = archiveRows.flatMap((row) => {
    const payload = parseMarketIqBriefingArchivePayload(row.payload);
    return payload ? [{ ...row, payload }] : [];
  });
  const preparedAt = new Date();

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <header className="grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_390px] lg:items-end">
      <div><p className="dq-eyebrow">Decision briefing</p><h1 className="dq-h1">What deserves attention across your markets</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Review changes since the prior edition, current rent direction, and markets that need setup or a source refresh. This is an internal briefing and is never sent to clients automatically.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">This week</p><p className="mt-3 text-xl font-semibold leading-7">{briefing.headline}</p><p className="mt-4 text-xs text-white/55">Prepared {preparedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p><form action={freezeMarketIqWeeklyBriefing}><button type="submit" className="mt-5 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-navy">Freeze this week</button></form></aside>
    </header>

    {params.saved === "1" && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">This week’s briefing is saved. Repeated saves leave the frozen copy unchanged.</div>}

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Markets</p><p className="mt-3 text-3xl font-semibold text-navy">{briefing.marketCount}</p><p className="mt-1 text-xs text-slate-500">included in this briefing</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current sources</p><p className="mt-3 text-3xl font-semibold text-navy">{briefing.currentMarkets.length}</p><p className="mt-1 text-xs text-slate-500">authoritative Trends IQ reads</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Drafts to review</p><p className="mt-3 text-3xl font-semibold text-navy">{briefing.reviews.length}</p><p className="mt-1 text-xs text-slate-500">private and unsent</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exceptions</p><p className="mt-3 text-3xl font-semibold text-navy">{briefing.sourceGaps.length + briefing.setupNeeds.length}</p><p className="mt-1 text-xs text-slate-500">source or setup issues</p></article>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-6 sm:px-8"><p className="dq-eyebrow">Since the prior edition</p><h2 className="dq-h2">Changes requiring review</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These findings passed the edition materiality rules. They describe changes between frozen editions, not ordinary year-over-year movement.</p></div>
      {briefing.reviews.length ? <div className="divide-y divide-slate-100">{briefing.reviews.map((item) => <article key={item.market.id} className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[0.75fr_1.5fr_0.55fr] lg:items-start">
        <div><p className="text-lg font-semibold text-navy">{item.market.fullName}</p><p className="mt-2 text-xs text-slate-500">Draft through {dateLabel(item.draft.periodEnd)}</p><p className="mt-2 text-sm font-semibold text-orange-700">{item.draft.materialChangeCount} material {item.draft.materialChangeCount === 1 ? "change" : "changes"}</p></div>
        <div className="space-y-4">{item.findings.length ? item.findings.map((finding) => <div key={finding.id}><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${finding.importance === "high" ? "bg-orange-100 text-orange-900" : "bg-slate-100 text-slate-600"}`}>{finding.importance}</span><p className="text-sm font-semibold text-navy">{finding.headline}</p></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{finding.detail}</p></div>) : <p className="text-sm leading-6 text-slate-600">The draft is ready for review. Open it to inspect the frozen comparison and source history.</p>}</div>
        <div className="lg:text-right"><Link href={`/market-iq/review?market=${encodeURIComponent(item.market.id)}`} className="inline-flex rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Review draft</Link></div>
      </article>)}</div> : <div className="px-6 py-9 sm:px-8"><p className="text-lg font-semibold text-navy">No new edition changes are waiting for review.</p><p className="mt-2 text-sm leading-6 text-slate-600">Current market direction is summarized below. A review item will appear only after authoritative Trends IQ advances and the recurring edition engine creates a private draft.</p></div>}
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-6 sm:px-8"><p className="dq-eyebrow">Current rent direction</p><h2 className="dq-h2">Largest local year-over-year moves</h2><p className="mt-2 text-sm leading-6 text-slate-600">This is the latest published Trends IQ direction in each market. It is context for investigation, not a claim that the move happened this week.</p></div>
        {briefing.currentMoves.length ? <div className="divide-y divide-slate-100">{briefing.currentMoves.map((item, index) => <Link key={item.market.id} href={`/market-iq/market?market=${encodeURIComponent(item.market.id)}`} className="grid gap-4 px-6 py-5 transition hover:bg-slate-50 sm:grid-cols-[36px_1fr_auto] sm:items-center sm:px-8"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span><span><span className="block text-sm font-semibold text-navy">{item.market.shortLabel}: {item.cell.geographyLabel}</span><span className="mt-1 block text-xs text-slate-500">{item.cell.label} · Trends IQ through {monthLabel(item.latestMonth)}</span></span><span className="text-right"><span className={`block text-lg font-semibold ${(item.cell.yearOverYearPct ?? 0) >= 0 ? "text-teal-700" : "text-orange-700"}`}>{signed(item.cell.yearOverYearPct)}</span><span className="mt-1 block text-xs text-slate-500">{rent(item.cell.rent)}</span></span></Link>)}</div> : <div className="px-6 py-9 sm:px-8"><p className="text-sm text-slate-600">No authoritative local Trends IQ moves are available right now.</p></div>}
      </article>

      <aside className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Exceptions</p><h2 className="mt-2 text-xl font-semibold text-navy">Markets needing attention</h2><div className="mt-5 space-y-5">{briefing.setupNeeds.map((item) => <div key={item.summary.market.id}><p className="text-sm font-semibold text-navy">{item.summary.market.shortLabel}</p><p className="mt-1 text-xs leading-5 text-slate-500">Choose the saved cities, ZIPs, and product segments for this market.</p><Link href={`/market-iq/get-started?market=${encodeURIComponent(item.summary.market.id)}`} className="mt-2 inline-flex text-xs font-semibold text-teal-700">Configure market →</Link></div>)}{briefing.sourceGaps.map((item) => <div key={item.summary.market.id}><p className="text-sm font-semibold text-navy">{item.summary.market.shortLabel}</p><p className="mt-1 text-xs leading-5 text-slate-500">The authoritative Trends IQ read is temporarily unavailable. Preview fallback values are not shown.</p><Link href={`/market-iq/market?market=${encodeURIComponent(item.summary.market.id)}`} className="mt-2 inline-flex text-xs font-semibold text-teal-700">Open source status →</Link></div>)}{!briefing.setupNeeds.length && !briefing.sourceGaps.length && <p className="text-sm leading-6 text-slate-600">No setup or source exceptions require attention.</p>}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Briefing archive</p><h2 className="mt-2 text-xl font-semibold text-navy">Frozen weekly reads</h2><div className="mt-5 space-y-4">{archives.length ? archives.map((archive) => <Link href={`/market-iq/briefing/${archive.id}`} key={archive.id} className="block border-t border-slate-100 pt-4 first:border-0 first:pt-0"><p className="text-sm font-semibold text-navy">Week of {dateLabel(archive.weekOf)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{archive.payload.headline}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{archive.payload.counts.reviews} reviews · {archive.payload.counts.exceptions} exceptions · Open archive</p></Link>) : <p className="text-sm leading-6 text-slate-600">No weekly briefing has been frozen yet.</p>}</div></section>
        <section className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Distribution boundary</p><p className="mt-3 text-lg font-semibold">Nothing on this page is sent automatically.</p><p className="mt-2 text-sm leading-6 text-white/70">Client Advisory still requires a reviewed edition, a published link, and explicit approval for each recipient.</p></section></aside>
    </section>
  </main>;
}
