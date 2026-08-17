import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveMarketIqRecipient, startMarketIqDistributionCampaign } from "@/app/market-iq/distribution/actions";
import { MarketIqWorkspaceNav } from "@/components/market-iq/MarketIqWorkspaceNav";
import { MarketIqRecipientDirectory } from "@/components/market-iq/distribution/MarketIqRecipientDirectory";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqDistributionPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const query = await searchParams;
  const [recipients, reports, sends, campaigns] = await Promise.all([
    prisma.marketIqReportRecipient.findMany({
      where: { organizationId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { sends: { orderBy: { createdAt: "desc" }, take: 1, select: { deliveryStatus: true, sentAt: true, deliveredAt: true, report: { select: { periodLabel: true } } } } },
    }),
    prisma.marketIqReport.findMany({
      where: { organizationId, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 24,
      select: { id: true, periodLabel: true, publishedAt: true, publicToken: true },
    }),
    prisma.marketIqReportSend.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, deliveryStatus: true, sentAt: true, deliveredAt: true, lastEmailEventType: true, recipient: { select: { name: true, email: true } }, report: { select: { periodLabel: true } } },
    }),
    prisma.marketIqDistributionCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, status: true, createdAt: true, report: { select: { periodLabel: true } }, _count: { select: { recipients: true } } },
    }),
  ]);

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <MarketIqWorkspaceNav />
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href="/market-iq/editions" className="hover:text-teal-700">Edition workflow</Link><span>/</span><span>Distribution</span></nav>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Recipient and distribution center</p><h1 className="dq-h1">Put the right market read in the right hands</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Maintain one reusable client and prospect directory, select an immutable published report, and see its delivery history without rebuilding the audience each month.</p></div><aside className="rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-teal-800">Safe by design</p><p className="mt-2 text-sm leading-6 text-slate-700">Saving a recipient never sends an email. Every delivery still requires an explicit report-level confirmation.</p></aside></header>
    {query.saved === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Recipient saved to the organization directory.</p>}
    <section className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
      <form action={saveMarketIqRecipient} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Add or update</p><h2 className="dq-h2">Save a recipient</h2><div className="mt-5 grid gap-4"><label className="text-sm font-semibold text-navy">Name<input name="name" required maxLength={120} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Email<input name="email" required type="email" maxLength={254} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Relationship<select name="kind" defaultValue="client" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="client">Current client</option><option value="prospect">Prospect</option></select></label><button className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Save recipient</button><p className="text-xs leading-5 text-slate-500">Using the same email again updates the existing record instead of creating a duplicate.</p></div></form>
      <div className="grid grid-cols-3 gap-3"><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{recipients.length}</p><p className="mt-1 text-xs text-slate-500">saved recipients</p></article><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{reports.length}</p><p className="mt-1 text-xs text-slate-500">published reads</p></article><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{sends.filter((send) => send.deliveredAt).length}</p><p className="mt-1 text-xs text-slate-500">recent deliveries</p></article></div>
    </section>
    <div className="mt-6"><MarketIqRecipientDirectory recipients={recipients} reports={reports} /></div>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Staged campaigns</p><h2 className="dq-h2">Audience review and confirmation</h2></div>{reports[0] && <form action={startMarketIqDistributionCampaign}><input type="hidden" name="reportId" value={reports[0].id} /><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Distribute latest edition</button></form>}</div>{campaigns.length ? <div className="mt-5 divide-y divide-slate-100">{campaigns.map((campaign) => <Link key={campaign.id} href={`/market-iq/distribution/${campaign.id}`} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold text-navy">{campaign.report.periodLabel}</p><p className="mt-1 text-xs text-slate-500">{campaign._count.recipients} recipients · created {campaign.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{campaign.status}</span></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">No staged campaigns yet. Publishing a new edition will open one automatically.</p>}</section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Delivery history</p><h2 className="dq-h2">Most recent activity</h2>{sends.length ? <div className="mt-4 divide-y divide-slate-100">{sends.map((send) => <article key={send.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-navy">{send.recipient.name} <span className="font-normal text-slate-400">· {send.recipient.email}</span></p><p className="mt-1 text-xs text-slate-500">{send.report.periodLabel}</p></div><div className="text-right"><p className="font-semibold capitalize text-navy">{send.deliveredAt ? "delivered" : send.deliveryStatus}</p><p className="mt-1 text-xs text-slate-400">{send.lastEmailEventType ?? (send.sentAt ? "Provider accepted" : "No provider event")}</p></div></article>)}</div> : <p className="mt-4 text-sm text-slate-500">No report deliveries have been recorded yet.</p>}</section>
  </main>;
}
