import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { startMarketIqDistributionCampaign } from "@/app/market-iq/distribution/actions";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqSharingPage({ searchParams }: { searchParams: Promise<{ market?: string; report?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!access.capabilities.manageRecipients) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const [query, workspacePreference] = await Promise.all([
    searchParams,
    prisma.marketIqWorkspacePreference.findUnique({ where: { organizationId }, select: { defaultMarketId: true } }),
  ]);
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: workspacePreference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket || !isMarketEntitled(access.entitlement, activeMarket.id)) redirect("/market-iq/subscribe");
  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);

  const [recipients, reports, sends, campaigns] = await Promise.all([
    prisma.marketIqReportRecipient.count({ where: { organizationId } }),
    prisma.marketIqReport.findMany({ where: { organizationId, marketId: activeMarket.id, status: "published" }, orderBy: { publishedAt: "desc" }, take: 24, select: { id: true, periodLabel: true, publishedAt: true, publicToken: true } }),
    prisma.marketIqReportSend.findMany({ where: { organizationId, report: { marketId: activeMarket.id } }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, deliveryStatus: true, sentAt: true, deliveredAt: true, lastEmailEventType: true, recipient: { select: { name: true, email: true } }, report: { select: { periodLabel: true } } } }),
    prisma.marketIqDistributionCampaign.findMany({ where: { organizationId, report: { marketId: activeMarket.id } }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, status: true, createdAt: true, report: { select: { periodLabel: true } }, _count: { select: { recipients: true } } } }),
  ]);
  const latest = reports.find((report) => report.id === query.report) ?? reports[0];

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href="/market-iq/editions" className="hover:text-teal-700">Client reporting</Link><span>/</span><span>Delivery</span></nav>
    <div className="mt-6"><MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath="/market-iq/sharing" /></div>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Delivery</p><h1 className="dq-h1">Prepare and track {activeMarket.shortLabel} delivery</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Choose a published market read, confirm its audience, and follow delivery status for this market. Your recipient directory is shared across all markets.</p></div><aside className="rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-teal-800">Recipient directory</p><p className="mt-2 text-sm leading-6 text-slate-700">{recipients} saved {recipients === 1 ? "recipient" : "recipients"}. Add people or import a spreadsheet before preparing a delivery.</p><Link href="/market-iq/distribution" className="mt-3 inline-flex text-sm font-semibold text-teal-800">Manage recipients →</Link></aside></header>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">{query.report && latest ? "Selected published read" : "Latest published read"}</p>{latest ? <><h2 className="dq-h2">{latest.periodLabel}</h2><p className="mt-2 text-sm text-slate-500">Published {latest.publishedAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p><div className="mt-5 flex flex-wrap gap-3"><Link href={`/reports/market/${latest.publicToken}`} target="_blank" className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy">Review client view</Link><form action={startMarketIqDistributionCampaign}><input type="hidden" name="reportId" value={latest.id} /><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Prepare delivery</button></form></div></> : <><h2 className="dq-h2">No {activeMarket.shortLabel} read published yet</h2><p className="mt-2 text-sm text-slate-500">Publish a client report before preparing delivery.</p><Link href={`/market-iq/editions?market=${encodeURIComponent(activeMarket.id)}`} className="mt-5 inline-flex rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open client reports</Link></>}</article>
      <div className="grid grid-cols-2 gap-3"><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-3xl font-semibold text-navy">{campaigns.filter((campaign) => ["draft", "ready", "partial"].includes(campaign.status)).length}</p><p className="mt-1 text-xs text-slate-500">active delivery drafts</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-3xl font-semibold text-navy">{sends.filter((send) => send.deliveredAt).length}</p><p className="mt-1 text-xs text-slate-500">recent deliveries</p></article></div>
    </section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Delivery drafts</p><h2 className="dq-h2">Audience review and confirmation</h2>{campaigns.length ? <div className="mt-5 divide-y divide-slate-100">{campaigns.map((campaign) => <Link key={campaign.id} href={`/market-iq/distribution/${campaign.id}`} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold text-navy">{campaign.report.periodLabel}</p><p className="mt-1 text-xs text-slate-500">{campaign._count.recipients} recipients · created {campaign.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{campaign.status}</span></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">No delivery drafts yet.</p>}</section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Delivery history</p><h2 className="dq-h2">Most recent activity</h2>{sends.length ? <div className="mt-4 divide-y divide-slate-100">{sends.map((send) => <article key={send.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-navy">{send.recipient.name} <span className="font-normal text-slate-400">· {send.recipient.email}</span></p><p className="mt-1 text-xs text-slate-500">{send.report.periodLabel}</p></div><div className="text-right"><p className="font-semibold capitalize text-navy">{send.deliveredAt ? "delivered" : send.deliveryStatus}</p><p className="mt-1 text-xs text-slate-400">{send.lastEmailEventType ?? (send.sentAt ? "Provider accepted" : "No provider event")}</p></div></article>)}</div> : <p className="mt-4 text-sm text-slate-500">No report deliveries have been recorded yet.</p>}</section>
  </main>;
}
