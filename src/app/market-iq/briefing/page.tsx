import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { rankMarketIqHomeMarkets } from "@/lib/market-iq/home-summary";
import { buildMarketIqComposerPreview, defaultMarketIqReportBrand } from "@/lib/market-iq/report/composer.server";
import { buildMarketIqWeeklyBriefing, parseMarketIqEditionComparison } from "@/lib/market-iq/weekly-briefing";
import { prisma } from "@/lib/prisma";

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

export default async function MarketIqBriefingPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [access, context] = await Promise.all([resolveViewerMarketIqAccess(), getActiveOrgContext()]);
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!context.organizationId) redirect("/setup-workspace");

  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  if (!entitledMarkets.length) redirect("/market-iq/subscribe");
  const workspace = await prisma.organization.findUnique({
    where: { id: context.organizationId },
    select: {
      name: true,
      brandProfile: true,
      marketIqMarketPreferences: true,
      marketIqEditionDrafts: {
        where: { status: { in: ["ready", "reviewing"] } },
        orderBy: { detectedAt: "desc" },
        select: { id: true, marketId: true, periodEnd: true, materialChangeCount: true, comparison: true },
      },
      marketIqReports: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        select: { marketId: true, publishedAt: true },
      },
    },
  });
  if (!workspace) redirect("/setup-workspace");

  const brand = workspace.brandProfile ?? defaultMarketIqReportBrand(workspace.name);
  const snapshots = await Promise.all(entitledMarkets.map(async (market) => {
    try {
      const preview = await buildMarketIqComposerPreview(market.id, brand);
      return { marketId: market.id, snapshot: preview.snapshot, source: preview.source as "dwellsy_trends" | "verified_seed" };
    } catch {
      return { marketId: market.id, snapshot: null, source: "unavailable" as const };
    }
  }));
  const snapshotByMarket = new Map(snapshots.map((item) => [item.marketId, item]));
  const draftByMarket = new Map(workspace.marketIqEditionDrafts.map((draft) => [draft.marketId, draft]));
  const preferenceByMarket = new Map(workspace.marketIqMarketPreferences.map((preference) => [preference.marketId, preference]));
  const latestReportByMarket = new Map<string, Date>();
  for (const report of workspace.marketIqReports) {
    if (report.publishedAt && !latestReportByMarket.has(report.marketId)) latestReportByMarket.set(report.marketId, report.publishedAt);
  }

  const summaries = rankMarketIqHomeMarkets(entitledMarkets.map((market) => {
    const source = snapshotByMarket.get(market.id);
    const preference = preferenceByMarket.get(market.id);
    return {
      market,
      snapshot: source?.snapshot ?? null,
      source: source?.source ?? "unavailable",
      configured: Boolean(preference?.configuredAt),
      recurringEnabled: Boolean(preference?.recurringEditionsEnabled),
      draft: draftByMarket.get(market.id) ?? null,
      latestPublishedAt: latestReportByMarket.get(market.id) ?? null,
      clientAdvisoryEnabled: access.capabilities.publishClientReports,
    };
  }));
  const briefing = buildMarketIqWeeklyBriefing(summaries.map((summary) => ({
    summary,
    comparison: parseMarketIqEditionComparison(draftByMarket.get(summary.market.id)?.comparison),
  })));
  const preparedAt = new Date();

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <header className="grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_390px] lg:items-end">
      <div><p className="dq-eyebrow">Decision briefing</p><h1 className="dq-h1">What deserves attention across your markets</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Review changes since the prior edition, current rent direction, and markets that need setup or a source refresh. This is an internal briefing and is never sent to clients automatically.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">This week</p><p className="mt-3 text-xl font-semibold leading-7">{briefing.headline}</p><p className="mt-4 text-xs text-white/55">Prepared {preparedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></aside>
    </header>

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
        <section className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Distribution boundary</p><p className="mt-3 text-lg font-semibold">Nothing on this page is sent automatically.</p><p className="mt-2 text-sm leading-6 text-white/70">Client Advisory still requires a reviewed edition, a published link, and explicit approval for each recipient.</p></section></aside>
    </section>
  </main>;
}
