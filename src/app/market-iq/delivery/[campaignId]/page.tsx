import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sendMarketIqCampaignRecipient } from "@/app/market-iq/distribution/actions";
import { CopyMarketReportLink } from "@/components/market-iq/CopyMarketReportLink";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateTimeLabel(value: Date | null | undefined) {
  return value?.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }) ?? "Not recorded";
}

function deliveryLabel(status: string, providerEvent: string | null | undefined) {
  if (providerEvent === "delivered") return "Delivered";
  if (["bounce", "dropped", "blocked"].includes(providerEvent ?? "")) return "Delivery problem";
  if (status === "sent" || status === "already_sent") return "Accepted for delivery";
  if (status === "failed") return "Failed";
  if (status === "suppressed") return "Suppressed";
  if (status === "sending") return "Sending";
  return "Awaiting confirmation";
}

function deliveryStyle(status: string, providerEvent: string | null | undefined) {
  if (providerEvent === "delivered") return "bg-emerald-50 text-emerald-800";
  if (["bounce", "dropped", "blocked"].includes(providerEvent ?? "") || status === "failed" || status === "suppressed") return "bg-rose-50 text-rose-800";
  if (status === "sent" || status === "already_sent") return "bg-teal-50 text-teal-800";
  return "bg-amber-50 text-amber-900";
}

export default async function MarketIqDeliveryReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, route, query] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    params,
    searchParams,
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect(`/setup-workspace?from=/market-iq/delivery/${route.campaignId}`);
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.manageRecipients) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const campaign = await prisma.marketIqDistributionCampaign.findFirst({
    where: { id: route.campaignId, organizationId },
    include: {
      report: { select: { id: true, periodLabel: true, publicToken: true, status: true, publishedAt: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        include: { recipient: true },
      },
    },
  });
  if (!campaign) notFound();
  const sends = campaign.recipients.length ? await prisma.marketIqReportSend.findMany({
    where: {
      organizationId,
      reportId: campaign.reportId,
      recipientId: { in: campaign.recipients.map((row) => row.recipientId) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      recipientId: true,
      deliveryStatus: true,
      deliveryError: true,
      sentAt: true,
      deliveredAt: true,
      lastEmailEventAt: true,
      lastEmailEventType: true,
    },
  }) : [];
  const sendByRecipient = new Map(sends.map((send) => [send.recipientId, send]));
  const delivered = campaign.recipients.filter((row) => sendByRecipient.get(row.recipientId)?.deliveredAt).length;
  const accepted = campaign.recipients.filter((row) => ["sent", "already_sent"].includes(row.status)).length;
  const failed = campaign.recipients.filter((row) => ["failed", "suppressed"].includes(row.status)).length;
  const pending = campaign.recipients.filter((row) => ["pending", "sending"].includes(row.status)).length;
  const reportPath = `/reports/market/${campaign.report.publicToken}`;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq">Market IQ</Link><span>/</span><Link href="/market-iq/editions">Client reports</Link><span>/</span><span>Delivery receipt</span></nav>

    <header className={`mt-6 overflow-hidden rounded-3xl text-white shadow-sm ${failed ? "bg-[#6f2431]" : "bg-navy"}`}>
      <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1fr_360px] lg:items-center lg:px-10 lg:py-10"><div><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-full text-lg font-bold text-navy ${failed ? "bg-amber-200" : "bg-emerald-300"}`}>{failed ? "!" : "✓"}</span><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">Delivery receipt</p></div><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{failed ? "Some recipients need attention" : "Your report was accepted for delivery"}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-white/70">This receipt records the reviewed report, named recipients, provider acceptance, and subsequent delivery events. It does not infer that an unopened email was read.</p></div><aside className="rounded-2xl border border-white/15 bg-white/10 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Report</p><p className="mt-2 text-lg font-semibold">{campaign.report.periodLabel}</p><p className="mt-2 text-sm capitalize text-white/65">Campaign {campaign.status}</p>{query.result && <p className="mt-4 rounded-full bg-white/10 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-white/80">Latest action: {query.result.replaceAll("_", " ")}</p>}</aside></div>
    </header>

    <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected</p><p className="mt-3 text-3xl font-semibold text-navy">{campaign.recipients.length}</p><p className="mt-1 text-xs text-slate-500">named recipients</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider accepted</p><p className="mt-3 text-3xl font-semibold text-navy">{accepted}</p><p className="mt-1 text-xs text-slate-500">unique report deliveries</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivered</p><p className="mt-3 text-3xl font-semibold text-navy">{delivered}</p><p className="mt-1 text-xs text-slate-500">confirmed provider events</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Needs attention</p><p className="mt-3 text-3xl font-semibold text-navy">{failed + pending}</p><p className="mt-1 text-xs text-slate-500">failed, suppressed, or pending</p></article></section>

    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-8"><div><p className="dq-eyebrow">Recipient record</p><h2 className="dq-h2">One status for each approved recipient</h2><p className="mt-2 text-sm leading-6 text-slate-600">A provider acceptance means the message entered the delivery network. A delivered event is shown separately when SendGrid reports it.</p></div><div className="flex flex-wrap gap-2"><Link href={reportPath} target="_blank" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy">Open client page</Link><CopyMarketReportLink path={reportPath} /></div></div>
      {campaign.recipients.length ? <div className="divide-y divide-slate-100">{campaign.recipients.map((row) => {
        const send = sendByRecipient.get(row.recipientId);
        const providerEvent = send?.lastEmailEventType;
        const retryAllowed = row.status === "failed" && row.recipient.emailStatus === "active";
        return <article key={row.id} className="px-6 py-6 sm:px-8"><div className="grid gap-4 lg:grid-cols-[1fr_190px_220px] lg:items-start"><div><p className="text-sm font-semibold text-navy">{row.recipient.name}</p><p className="mt-1 text-xs text-slate-500">{row.recipient.email} · {row.recipient.kind}</p>{send?.deliveryError && <p className="mt-2 max-w-2xl text-xs leading-5 text-rose-700">{send.deliveryError}</p>}{row.lastError && !send?.deliveryError && <p className="mt-2 max-w-2xl text-xs leading-5 text-rose-700">{row.lastError}</p>}</div><div><span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${deliveryStyle(row.status, providerEvent)}`}>{deliveryLabel(row.status, providerEvent)}</span><p className="mt-2 text-[11px] text-slate-400">{send?.deliveredAt ? dateTimeLabel(send.deliveredAt) : send?.sentAt ? dateTimeLabel(send.sentAt) : dateTimeLabel(row.sentAt)}</p></div><div className="lg:text-right">{retryAllowed ? <form action={sendMarketIqCampaignRecipient} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"><input type="hidden" name="campaignRecipientId" value={row.id} /><label className="flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-amber-950"><input required type="checkbox" name="confirmation" value={row.id} className="mt-0.5 size-4" /><span>I confirm this retry for {row.recipient.email}.</span></label><button className="mt-2 rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Retry recipient</button></form> : <p className="text-xs text-slate-500">{row.status === "suppressed" ? "Restore the address in Recipients before retrying." : providerEvent ? `Latest provider event: ${providerEvent}` : "No further action required."}</p>}</div></div></article>;
      })}</div> : <p className="px-6 py-10 text-center text-sm text-slate-500 sm:px-8">No recipients were selected for this campaign.</p>}
    </section>

    <section className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Continue working</p><p className="mt-2 text-lg font-semibold text-navy">{pending ? `${pending} ${pending === 1 ? "recipient still needs" : "recipients still need"} confirmation` : "This campaign has no pending confirmations"}</p><p className="mt-1 text-sm text-slate-600">Return to the campaign to confirm pending recipients, or open Client reports for the complete history.</p></div><div className="flex flex-wrap gap-2">{pending > 0 && <Link href={`/market-iq/distribution/${campaign.id}`} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Continue confirmations</Link>}<Link href="/market-iq/editions" className="rounded-md border border-teal-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy">Open Client reports</Link></div></section>
  </main>;
}
