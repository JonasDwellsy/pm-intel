import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPlanForKey } from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { rankMarketIqHomeMarkets } from "@/lib/market-iq/home-summary";
import { buildMarketIqComposerPreview, defaultMarketIqReportBrand } from "@/lib/market-iq/report/composer.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dateLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "None yet";
}

function monthLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    : "Awaiting source";
}

function rent(value: number | null | undefined) {
  return value ? `$${value.toLocaleString("en-US")}` : "Not available";
}

function change(value: number | null | undefined) {
  return value === null || value === undefined ? "No year-over-year read" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}% YoY`;
}

const STATUS_STYLE: Record<string, string> = {
  "Review needed": "bg-orange-100 text-orange-900",
  "Setup needed": "bg-amber-100 text-amber-900",
  "Source unavailable": "bg-rose-100 text-rose-900",
  Monitoring: "bg-emerald-100 text-emerald-800",
  Current: "bg-slate-100 text-slate-700",
};

export default async function MarketIqHomePage() {
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
      marketIqWorkspacePreference: true,
      marketIqMarketPreferences: true,
      marketIqEditionDrafts: {
        where: { status: { in: ["ready", "reviewing"] } },
        orderBy: { detectedAt: "desc" },
        select: { id: true, marketId: true, periodEnd: true, materialChangeCount: true },
      },
      marketIqReports: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        select: { marketId: true, publishedAt: true },
      },
      marketIqBriefingSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, weekOf: true, createdAt: true },
      },
      marketIqBriefingEmailPreferences: {
        where: { userId: context.userId ?? "__no_user__" },
        take: 1,
        select: { enabled: true, recipientEmail: true },
      },
      marketIqBriefingEmailDeliveries: {
        where: { userId: context.userId ?? "__no_user__" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { snapshotId: true, status: true, sentAt: true, createdAt: true },
      },
      _count: { select: { marketIqReportRecipients: true, marketIqReports: true } },
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
  const latestReportByMarket = new Map<string, Date>();
  for (const report of workspace.marketIqReports) {
    if (report.publishedAt && !latestReportByMarket.has(report.marketId)) latestReportByMarket.set(report.marketId, report.publishedAt);
  }
  const draftByMarket = new Map(workspace.marketIqEditionDrafts.map((draft) => [draft.marketId, draft]));
  const preferenceByMarket = new Map(workspace.marketIqMarketPreferences.map((preference) => [preference.marketId, preference]));
  const markets = rankMarketIqHomeMarkets(entitledMarkets.map((market) => {
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

  const draftCount = markets.filter((market) => market.draft).length;
  const configuredCount = markets.filter((market) => market.configured).length;
  const currentCount = markets.filter((market) => market.snapshot && market.source === "dwellsy_trends").length;
  const plan = marketIqPlanForKey(access.planKey);
  const advisory = access.capabilities.publishClientReports;
  const latestBriefing = workspace.marketIqBriefingSnapshots[0] ?? null;
  const briefingPreference = workspace.marketIqBriefingEmailPreferences[0] ?? null;
  const briefingDelivery = workspace.marketIqBriefingEmailDeliveries[0] ?? null;
  const currentBriefingDelivered = Boolean(latestBriefing && briefingDelivery?.snapshotId === latestBriefing.id && briefingDelivery.status === "sent");
  const briefingStatus = !latestBriefing
    ? { label: "No frozen briefing", detail: "Open the weekly briefing and freeze the current read when it is ready.", style: "bg-slate-100 text-slate-700" }
    : currentBriefingDelivered
      ? { label: "Current briefing emailed", detail: `Sent ${dateLabel(briefingDelivery?.sentAt ?? briefingDelivery?.createdAt ?? null)} to your signed-in address.`, style: "bg-emerald-100 text-emerald-800" }
      : briefingPreference?.enabled
        ? { label: "New briefing ready", detail: "Your latest frozen briefing has not been emailed yet.", style: "bg-amber-100 text-amber-900" }
        : { label: "Email updates off", detail: "The frozen briefing is available in Market IQ. Internal email is optional.", style: "bg-slate-100 text-slate-700" };

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <header className="border-b border-grid pb-9">
      <div><p className="dq-eyebrow">Your markets</p><h1 className="dq-h1">One place to see what needs attention</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Compare the latest rental-market read across every market in your plan, then move directly into the local analysis or client-report work that matters.</p><Link href="/market-iq/briefing" className="mt-5 inline-flex text-sm font-semibold text-teal-700">Open the weekly briefing →</Link></div>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Markets included</p><p className="mt-3 text-3xl font-semibold text-navy">{markets.length}</p><p className="mt-1 text-xs text-slate-500">{configuredCount} configured</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current data</p><p className="mt-3 text-3xl font-semibold text-navy">{currentCount} of {markets.length}</p><p className="mt-1 text-xs text-slate-500">authoritative market reads available</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Drafts to review</p><p className="mt-3 text-3xl font-semibold text-navy">{draftCount}</p><p className="mt-1 text-xs text-slate-500">private and unsent</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your plan</p><p className="mt-3 text-2xl font-semibold text-navy">{plan?.tier === "client_advisory" || access.source !== "subscription" ? "Client Advisory" : "Intelligence"}</p><Link href="/market-iq/account" className="mt-1 inline-block text-xs font-semibold text-teal-700">Account and settings →</Link></article>
    </section>

    <section className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center sm:p-7"><div><div className="flex flex-wrap items-center gap-3"><p className="dq-eyebrow">Your internal briefing</p><span className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${briefingStatus.style}`}>{briefingStatus.label}</span></div><h2 className="mt-2 text-xl font-semibold text-navy">{latestBriefing ? `Week of ${dateLabel(latestBriefing.weekOf)}` : "Save a weekly decision record"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{briefingStatus.detail}</p>{briefingPreference?.enabled && <p className="mt-1 text-xs text-slate-500">Delivery preference: {briefingPreference.recipientEmail}</p>}</div><Link href="/market-iq/briefing" className="rounded-md bg-navy px-4 py-2.5 text-center text-sm font-semibold text-white">{latestBriefing ? "Open briefing" : "Prepare briefing"}</Link></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-6 py-6 sm:px-8"><div><p className="dq-eyebrow">Market portfolio</p><h2 className="dq-h2">Latest read by market</h2><p className="mt-2 text-sm leading-6 text-slate-600">Markets are ordered by review work, setup needs, source availability, and the size of current rent movement.</p></div><Link href="/market-iq/account" className="text-sm font-semibold text-teal-700">Manage market settings →</Link></div>
      <div className="divide-y divide-slate-100">{markets.map((item) => <article key={item.market.id} className="grid gap-6 px-6 py-7 sm:px-8 xl:grid-cols-[1.15fr_0.7fr_0.7fr_0.8fr] xl:items-center">
        <div><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold text-navy">{item.market.fullName}</h3><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLE[item.status] ?? STATUS_STYLE.Current}`}>{item.status}</span></div><p className="mt-3 text-sm font-semibold leading-6 text-navy">{item.headline}</p><p className="mt-2 text-xs text-slate-500">Trends IQ through {monthLabel(item.latestMonth)} · {item.configured ? "Saved scope active" : "Scope not configured"}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1-bed apartments</p><p className="mt-2 text-xl font-semibold text-navy">{rent(item.apartment?.rent)}</p><p className="mt-1 text-xs text-slate-500">{change(item.apartment?.yearOverYearPct)}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3-bed houses</p><p className="mt-2 text-xl font-semibold text-navy">{rent(item.house?.rent)}</p><p className="mt-1 text-xs text-slate-500">{change(item.house?.yearOverYearPct)}</p></div>
        <div className="xl:text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client reporting</p><p className="mt-2 text-sm font-semibold text-navy">{item.draft ? `Draft through ${dateLabel(item.draft.periodEnd)}` : item.latestPublishedAt ? `Last published ${dateLabel(item.latestPublishedAt)}` : advisory ? "No report published" : "Upgrade available"}</p><div className="mt-4 flex flex-wrap gap-2 xl:justify-end"><Link href={item.actionHref} className="rounded-md bg-navy px-3.5 py-2 text-xs font-semibold text-white">{item.actionLabel}</Link>{item.configured && advisory && <Link href={`/market-iq/editions?market=${encodeURIComponent(item.market.id)}`} className="rounded-md border border-slate-300 px-3.5 py-2 text-xs font-semibold text-navy">Reports</Link>}</div></div>
      </article>)}</div>
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="dq-eyebrow">How to use this page</p><h2 className="dq-h2">Start with the market, then decide whether it belongs in a client conversation</h2><p className="mt-3 text-sm leading-6 text-slate-600">Open the detailed market read to understand the MSA, city, ZIP, and product-segment evidence. Client Advisory work remains separate and deliberate: review the private draft, add your firm’s perspective, publish the link, then approve each recipient individually.</p></article>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Client channel</p><p className="mt-2 text-2xl font-semibold text-navy">{workspace._count.marketIqReportRecipients} saved recipients</p><p className="mt-2 text-sm leading-6 text-slate-600">{workspace._count.marketIqReports} reports created across {markets.length} markets. Reports and recurring drafts remain market-specific.</p>{advisory ? <Link href="/market-iq/sharing" className="mt-5 inline-flex text-sm font-semibold text-teal-800">Open sharing →</Link> : <Link href="/market-iq/subscribe?upgrade=client_advisory" className="mt-5 inline-flex text-sm font-semibold text-teal-800">Add Client Advisory →</Link>}</aside>
    </section>
  </main>;
}
