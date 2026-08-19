import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "None yet";
}

const CAMPAIGN_STATUSES = ["draft", "ready", "sending", "partial"];

export default async function MarketIqClientReportingPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [access, context] = await Promise.all([resolveViewerMarketIqAccess(), getActiveOrgContext()]);
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");
  if (!context.organizationId) redirect("/setup-workspace");

  const markets = listEntitledMarketIqMarkets(access.entitlement);
  const marketIds = markets.map((market) => market.id);
  // eslint-disable-next-line react-hooks/purity -- This dynamic server page needs a request-time reporting window.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [preferences, reports, drafts, activeRecipients, monthlyRecipients, delivered, engagement, activeCampaigns] = await Promise.all([
    prisma.marketIqMarketPreference.findMany({
      where: { organizationId: context.organizationId, marketId: { in: marketIds } },
      select: { marketId: true, configuredAt: true, recurringEditionsEnabled: true, deliveryMode: true },
    }),
    prisma.marketIqReport.findMany({
      where: { organizationId: context.organizationId, marketId: { in: marketIds }, status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { id: true, marketId: true, periodLabel: true, publicToken: true, publishedAt: true },
    }),
    prisma.marketIqEditionDraft.findMany({
      where: { organizationId: context.organizationId, marketId: { in: marketIds }, status: { in: ["ready", "reviewing"] } },
      orderBy: { detectedAt: "desc" },
      select: { id: true, marketId: true, periodEnd: true, materialChangeCount: true, status: true },
    }),
    prisma.marketIqReportRecipient.count({ where: { organizationId: context.organizationId, emailStatus: "active" } }),
    prisma.marketIqReportRecipient.count({ where: { organizationId: context.organizationId, emailStatus: "active", recurringDeliveryApprovedAt: { not: null } } }),
    prisma.marketIqReportSend.count({ where: { organizationId: context.organizationId, deliveredAt: { gte: thirtyDaysAgo } } }),
    prisma.marketIqEmailEvent.count({ where: { organizationId: context.organizationId, occurredAt: { gte: thirtyDaysAgo }, eventType: { in: ["open", "click"] } } }),
    prisma.marketIqDistributionCampaign.count({ where: { organizationId: context.organizationId, status: { in: CAMPAIGN_STATUSES } } }),
  ]);

  const preferenceByMarket = new Map(preferences.map((item) => [item.marketId, item]));
  const reportByMarket = new Map<string, (typeof reports)[number]>();
  for (const report of reports) if (!reportByMarket.has(report.marketId)) reportByMarket.set(report.marketId, report);
  const draftByMarket = new Map<string, (typeof drafts)[number]>();
  for (const draft of drafts) if (!draftByMarket.has(draft.marketId)) draftByMarket.set(draft.marketId, draft);
  const configuredMarkets = preferences.filter((item) => item.configuredAt).length;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <header className="grid gap-6 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Client reporting</p><h1 className="dq-h1">Prepare, deliver, and measure every market read</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Manage the full client-reporting cycle in one place. Build the market read, review your firm’s message, choose the audience, send or schedule it, and see what happened.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">Reporting status</p><p className="mt-2 text-2xl font-semibold">{drafts.length ? `${drafts.length} report${drafts.length === 1 ? "" : "s"} ready for review` : "No reports waiting for review"}</p><p className="mt-2 text-sm leading-6 text-white/65">{activeCampaigns ? `${activeCampaigns} delivery workflow${activeCampaigns === 1 ? " is" : "s are"} in progress.` : "No delivery workflows are in progress."}</p></aside>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reports to review</p><p className="mt-3 text-4xl font-semibold text-navy">{drafts.length}</p><p className="mt-2 text-sm text-slate-500">Private and unsent</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active recipients</p><p className="mt-3 text-4xl font-semibold text-navy">{activeRecipients}</p><p className="mt-2 text-sm text-slate-500">{monthlyRecipients} approved for monthly delivery</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivered</p><p className="mt-3 text-4xl font-semibold text-navy">{delivered}</p><p className="mt-2 text-sm text-slate-500">Past 30 days</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Engagement events</p><p className="mt-3 text-4xl font-semibold text-navy">{engagement}</p><p className="mt-2 text-sm text-slate-500">Opens and clicks in the past 30 days</p></article>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6 sm:p-8"><p className="dq-eyebrow">Reporting workflow</p><h2 className="dq-h2">From market read to client conversation</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Each step has a distinct job. Nothing is emailed until the delivery step, unless your firm has explicitly enabled monthly automatic delivery.</p></div>
      <div className="grid divide-y divide-slate-100 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {[
          { number: "1", title: "Build report", detail: "Use the latest saved market scope and Trends IQ evidence.", href: "/market-iq/editions", label: "Open reports" },
          { number: "2", title: "Review", detail: "Confirm the market read and add your firm’s perspective.", href: "/market-iq/editions", label: drafts.length ? "Review drafts" : "View editions" },
          { number: "3", title: "Choose recipients", detail: "Maintain clients and prospects, including monthly approval.", href: "/market-iq/distribution", label: "Manage recipients" },
          { number: "4", title: "Schedule or send", detail: "Prepare a delivery and confirm its audience.", href: "/market-iq/sharing", label: "Open delivery" },
          { number: "5", title: "Monitor", detail: "Review delivery health and client engagement.", href: "/market-iq/performance", label: "View performance" },
        ].map((step) => <article key={step.number} className="p-6"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-navy">{step.number}</span><h3 className="mt-4 text-lg font-semibold text-navy">{step.title}</h3><p className="mt-2 min-h-16 text-sm leading-6 text-slate-500">{step.detail}</p><Link href={step.href} className="mt-4 inline-flex text-sm font-semibold text-teal-700">{step.label} →</Link></article>)}
      </div>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-6 sm:p-8"><div><p className="dq-eyebrow">Markets</p><h2 className="dq-h2">Reporting status by market</h2><p className="mt-2 text-sm text-slate-600">{configuredMarkets} of {markets.length} markets are configured for client reporting.</p></div><Link href="/market-iq/get-started" className="text-sm font-semibold text-teal-700">Manage market settings →</Link></div>
      <div className="divide-y divide-slate-100">{markets.map((market) => {
        const preference = preferenceByMarket.get(market.id);
        const report = reportByMarket.get(market.id);
        const draft = draftByMarket.get(market.id);
        const configured = Boolean(preference?.configuredAt);
        const action = !configured
          ? { href: `/market-iq/get-started?market=${encodeURIComponent(market.id)}`, label: "Configure market" }
          : draft
            ? { href: `/market-iq/editions?market=${encodeURIComponent(market.id)}`, label: "Review draft" }
            : { href: `/market-iq/editions?market=${encodeURIComponent(market.id)}`, label: "Open reports" };
        return <article key={market.id} className="grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto] lg:items-center">
          <div><h3 className="text-lg font-semibold text-navy">{market.fullName}</h3><p className="mt-1 text-sm text-slate-500">{configured ? "Market scope configured" : "Setup required before reporting"}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latest report</p><p className="mt-2 text-sm font-semibold text-navy">{report ? report.periodLabel : "None published"}</p><p className="mt-1 text-xs text-slate-500">{report ? dateLabel(report.publishedAt) : "No public link"}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery mode</p><p className="mt-2 text-sm font-semibold text-navy">{preference?.deliveryMode === "autopilot" ? "Monthly automatic" : "Review before sending"}</p><p className="mt-1 text-xs text-slate-500">{draft ? `Draft through ${dateLabel(draft.periodEnd)}` : "No draft waiting"}</p></div>
          <Link href={action.href} className="rounded-md bg-navy px-4 py-2.5 text-center text-sm font-semibold text-white">{action.label}</Link>
        </article>;
      })}</div>
    </section>
  </main>;
}
