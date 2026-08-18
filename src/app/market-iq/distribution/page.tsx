import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveMarketIqRecipient } from "@/app/market-iq/distribution/actions";
import { MarketIqRecipientBulkImport } from "@/components/market-iq/distribution/MarketIqRecipientBulkImport";
import { MarketIqRecipientDirectory } from "@/components/market-iq/distribution/MarketIqRecipientDirectory";
import { MarketIqLaunchJourney } from "@/components/market-iq/launch/MarketIqLaunchJourney";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqRecipientsPage({ searchParams }: { searchParams: Promise<{ saved?: string; flow?: string; imported?: string; updated?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.manageRecipients) redirect("/market-iq/subscribe?upgrade=client_advisory");
  const query = await searchParams;
  const recipients = await prisma.marketIqReportRecipient.findMany({
    where: { organizationId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { sends: { orderBy: { createdAt: "desc" }, take: 1, select: { deliveryStatus: true, sentAt: true, deliveredAt: true, report: { select: { periodLabel: true } } } } },
  });
  const recurringCount = recipients.filter((recipient) => recipient.recurringDeliveryApprovedAt).length;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    {query.flow === "launch" && <MarketIqLaunchJourney current="recipients" />}
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Recipients</span></nav>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Recipient directory</p><h1 className="dq-h1">Keep clients and prospects organized</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Add people one at a time or import a spreadsheet. Preparing reports and reviewing deliveries now happens in Sharing.</p></div><aside className="rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-teal-800">No email is sent here</p><p className="mt-2 text-sm leading-6 text-slate-700">Saving or importing a recipient only updates your directory. Monthly delivery requires separate approval for each person.</p><Link href="/market-iq/sharing" className="mt-3 inline-flex text-sm font-semibold text-teal-800">Open Sharing →</Link></aside></header>
    {query.saved === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Recipient saved to the directory.</p>}
    {query.imported !== undefined && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Spreadsheet imported. {Number(query.imported) || 0} added and {Number(query.updated) || 0} updated.</p>}
    <section className="mt-8 grid gap-6 xl:grid-cols-[340px_1fr]">
      <form id="add-recipient" action={saveMarketIqRecipient} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{query.flow === "launch" && <input type="hidden" name="returnTo" value="launch" />}<p className="dq-eyebrow">Add one person</p><h2 className="dq-h2">Save a recipient</h2><div className="mt-5 grid gap-4"><label className="text-sm font-semibold text-navy">Name<input name="name" required maxLength={120} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Email<input name="email" required type="email" maxLength={254} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">Relationship<select name="kind" defaultValue="client" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="client">Current client</option><option value="prospect">Prospect</option></select></label><label className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-5 text-slate-700"><span className="flex items-start gap-3"><input type="checkbox" name="approveRecurringDelivery" value="1" className="mt-1" /><span><strong className="block text-navy">Include in automatic monthly delivery</strong>I confirm that this person should receive future monthly editions.</span></span></label><button className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Save recipient</button><p className="text-xs leading-5 text-slate-500">Using the same email updates the existing record.</p></div></form>
      <div className="grid gap-6"><MarketIqRecipientBulkImport /><div className="grid grid-cols-2 gap-3"><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{recipients.length}</p><p className="mt-1 text-xs text-slate-500">saved recipients</p></article><article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-semibold text-navy">{recurringCount}</p><p className="mt-1 text-xs text-slate-500">approved for monthly delivery</p></article></div></div>
    </section>
    <div className="mt-6"><MarketIqRecipientDirectory recipients={recipients} /></div>
  </main>;
}
