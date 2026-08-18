import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveMarketIqRecipient, startMarketIqDistributionCampaign } from "@/app/market-iq/distribution/actions";
import { MarketIqRecipientDirectory } from "@/components/market-iq/distribution/MarketIqRecipientDirectory";
import { MarketIqLaunchJourney } from "@/components/market-iq/launch/MarketIqLaunchJourney";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqDistributionPage({ searchParams }: { searchParams: Promise<{ saved?: string; flow?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.manageRecipients) redirect("/market-iq/subscribe?upgrade=client_advisory");
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
    {query.flow === "launch" && <MarketIqLaunchJourney current="recipients" />}
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href="/market-iq/editions" className="hover:text-teal-700">Client reports</Link><span>/</span><span>Recipients</span></nav>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Recipients</p><h1 className="dq-h1">Share the right market read with the right people</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Keep one client and prospect directory, choose a published report, and review its delivery history.</p></div><aside className="rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-teal-800">Before you send</p><p className="mt-2 text-sm leading-6 text-slate-700">Saving a recipient does not send an email. You approve each delivery separately.</p></aside></header>
    {query.saved === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Recipient saved to the organization directory.</p>}
    <section className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
      <form id="add-recipient" action={saveMarketIqRecipient} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{query.flow === "launch" && <input type="hidden" name="returnTo" value="launch" />}<p className="dq-eyebrow">Add or update</p><h2 className="dq-h2">Save a recipient</h2><div className="mt-5 grid gap-4"><label className="text-sm font-semibold text-navy">Name<input name="name" required maxLength={120} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Email<input name="email" required type="email" maxLength={254} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Relationship<select name="kind" defaultValue="client" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="client">Current client</option><option value="prospect">Prospect</option></select></label><label className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-5 text-slate-700"><span className="flex items-start gap-3"><input type="checkbox" name="approveRecurringDelivery" value="1" className="mt-1" /><span><strong className="block text-navy">Include in automatic monthly delivery</strong>I confirm that this named person should receive future monthly editions without another send approval.</span></span></label><button className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Save recipient and continue</button><p className="text-xs leading-5 text-slate-500">Using the same email again updates the existing record instead of creating a duplicate.</p></div></form>
      <div className="grid grid-cols-3 gap-3"><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{recipients.length}</p><p className="mt-1 text-xs text-slate-500">saved recipients</p></article><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{reports.length}</p><p className="mt-1 text-xs text-slate-500">published reads</p></article><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{sends.filter((send) => send.deliveredAt).length}</p><p className="mt-1 text-xs text-slate-500">recent deliveries</p></article></div>
    </section>
    <div className="mt-6"><MarketIqRecipientDirectory recipients={recipients} reports={reports} /></div>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Staged campaigns</p><h2 className="dq-h2">Audience review and confirmation</h2></div>{reports[0] && <form action={startMarketIqDistributionCampaign}><input type="hidden" name="reportId" value={reports[0].id} />{query.flow === "launch" && <input type="hidden" name="flow" value="launch" />}<button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Distribute latest edition</button></form>}</div>{campaigns.length ? <div className="mt-5 divide-y divide-slate-100">{campaigns.map((campaign) => <Link key={campaign.id} href={`/market-iq/distribution/${campaign.id}${query.flow === "launch" ? "?flow=launch" : ""}`} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold text-navy">{campaign.report.periodLabel}</p><p className="mt-1 text-xs text-slate-500">{campaign._count.recipients} recipients · created {campaign.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{campaign.status}</span></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">No staged campaigns yet. Publishing a new edition will open one automatically.</p>}</section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Delivery history</p><h2 className="dq-h2">Most recent activity</h2>{sends.length ? <div className="mt-4 divide-y divide-slate-100">{sends.map((send) => <article key={send.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-navy">{send.recipient.name} <span className="font-normal text-slate-400">· {send.recipient.email}</span></p><p className="mt-1 text-xs text-slate-500">{send.report.periodLabel}</p></div><div className="text-right"><p className="font-semibold capitalize text-navy">{send.deliveredAt ? "delivered" : send.deliveryStatus}</p><p className="mt-1 text-xs text-slate-400">{send.lastEmailEventType ?? (send.sentAt ? "Provider accepted" : "No provider event")}</p></div></article>)}</div> : <p className="mt-4 text-sm text-slate-500">No report deliveries have been recorded yet.</p>}</section>
  </main>;
}
