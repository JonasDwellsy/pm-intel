import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FAILURE_EVENTS = new Set(["bounce", "dropped", "spamreport", "unsubscribe"]);

function percent(value: number, total: number) {
  if (!total) return "No sends yet";
  return `${Math.round((value / total) * 100)}%`;
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function shortDate(value: Date | null | undefined) {
  return value?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) ?? "Not published";
}

function latestEventLabel(value: string | null) {
  if (!value) return "No provider event";
  if (value === "open") return "Open was latest";
  if (value === "click") return "Click was latest";
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export default async function MarketIqPerformancePage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const now = new Date();
  const reportingStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const monthStarts = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1)));

  const [organization, reports, sends, recipients, campaigns, events] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, brandProfile: { select: { displayName: true } } } }),
    prisma.marketIqReport.findMany({
      where: { organizationId, status: "published", publishedAt: { gte: reportingStart } },
      orderBy: { publishedAt: "desc" },
      take: 24,
      select: { id: true, periodLabel: true, publishedAt: true, publicToken: true },
    }),
    prisma.marketIqReportSend.findMany({
      where: { organizationId, createdAt: { gte: reportingStart } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, reportId: true, deliveryStatus: true, deliveryError: true, sentAt: true, deliveredAt: true,
        lastEmailEventAt: true, lastEmailEventType: true, createdAt: true,
        recipient: { select: { id: true, name: true, email: true, kind: true, emailStatus: true, suppressionReason: true } },
        report: { select: { periodLabel: true } },
      },
    }),
    prisma.marketIqReportRecipient.findMany({
      where: { organizationId },
      orderBy: [{ emailStatus: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, kind: true, emailStatus: true, suppressionReason: true, suppressedAt: true },
    }),
    prisma.marketIqDistributionCampaign.findMany({
      where: { organizationId, createdAt: { gte: reportingStart } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, reportId: true, status: true, createdAt: true, completedAt: true, _count: { select: { recipients: true } } },
    }),
    prisma.marketIqEmailEvent.findMany({
      where: { organizationId, occurredAt: { gte: reportingStart } },
      orderBy: { occurredAt: "desc" },
      select: {
        reportSendId: true,
        eventType: true,
        occurredAt: true,
        reportSend: { select: { reportId: true, recipient: { select: { id: true, name: true, email: true, kind: true } } } },
      },
    }),
  ]);
  if (!organization) redirect("/setup-workspace");

  const accepted = sends.filter((send) => Boolean(send.sentAt));
  const deliveredEventSendIds = new Set(events.filter((event) => event.eventType === "delivered").map((event) => event.reportSendId));
  const failedEventSendIds = new Set(events.filter((event) => FAILURE_EVENTS.has(event.eventType)).map((event) => event.reportSendId));
  const openedSendIds = new Set(events.filter((event) => event.eventType === "open").map((event) => event.reportSendId));
  const clickedSendIds = new Set(events.filter((event) => event.eventType === "click").map((event) => event.reportSendId));
  const delivered = sends.filter((send) => Boolean(send.deliveredAt) || deliveredEventSendIds.has(send.id));
  const failed = sends.filter((send) => send.deliveryStatus === "failed" || failedEventSendIds.has(send.id));
  const observedEngagementSendIds = new Set([...openedSendIds, ...clickedSendIds]);
  const trackedDeliveredCount = deliveredEventSendIds.size;
  const eventTrackingStart = events.length ? events[events.length - 1].occurredAt : null;
  const activeRecipients = recipients.filter((recipient) => recipient.emailStatus === "active");
  const suppressedRecipients = recipients.filter((recipient) => recipient.emailStatus === "suppressed");
  const clientRecipients = recipients.filter((recipient) => recipient.kind === "client");
  const prospectRecipients = recipients.filter((recipient) => recipient.kind === "prospect");

  const monthActivity = monthStarts.map((start) => {
    const key = monthKey(start);
    const sent = accepted.filter((item) => item.sentAt && monthKey(item.sentAt) === key).length;
    const deliveredCount = delivered.filter((item) => item.deliveredAt && monthKey(item.deliveredAt) === key).length;
    return { key, label: monthLabel(start), sent, delivered: deliveredCount };
  });
  const maxMonthly = Math.max(1, ...monthActivity.map((month) => month.sent));

  const reportRows = reports.map((report) => {
    const reportSends = sends.filter((send) => send.reportId === report.id);
    const campaign = campaigns.find((item) => item.reportId === report.id);
    return {
      ...report,
      campaign,
      audience: reportSends.length,
      delivered: reportSends.filter((send) => Boolean(send.deliveredAt) || deliveredEventSendIds.has(send.id)).length,
      failed: reportSends.filter((send) => send.deliveryStatus === "failed" || failedEventSendIds.has(send.id)).length,
      opened: reportSends.filter((send) => openedSendIds.has(send.id)).length,
      clicked: reportSends.filter((send) => clickedSendIds.has(send.id)).length,
    };
  });

  const engagedProspects = events
    .filter((event) => event.eventType === "click" && event.reportSend.recipient.kind === "prospect")
    .filter((event, index, all) => all.findIndex((candidate) => candidate.reportSend.recipient.id === event.reportSend.recipient.id) === index)
    .slice(0, 8);

  const followUp = sends
    .filter((send) => send.deliveryStatus === "failed" || send.recipient.emailStatus === "suppressed")
    .filter((send, index, all) => all.findIndex((candidate) => candidate.recipient.id === send.recipient.id) === index)
    .slice(0, 8);

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Performance</span></nav>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Client Advisory performance</p><h1 className="dq-h1">Know what reached clients and what needs attention</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Review edition delivery, recipient health, and the latest engagement signal for {organization.brandProfile?.displayName ?? organization.name}.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">Reporting window</p><p className="mt-2 text-xl font-semibold">Trailing 12 months</p><p className="mt-2 text-sm leading-6 text-white/65">SendGrid delivery evidence through {shortDate(now)}.</p></aside>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Published editions</p><p className="mt-3 text-4xl font-semibold text-navy">{reports.length}</p><p className="mt-2 text-sm text-slate-500">Frozen client-ready market reads</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Emails delivered</p><p className="mt-3 text-4xl font-semibold text-navy">{delivered.length}</p><p className="mt-2 text-sm text-slate-500">{percent(delivered.length, accepted.length)} of {accepted.length} provider-accepted sends</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Active audience</p><p className="mt-3 text-4xl font-semibold text-navy">{activeRecipients.length}</p><p className="mt-2 text-sm text-slate-500">{clientRecipients.length} clients · {prospectRecipients.length} prospects</p></article>
      <article className={`rounded-2xl border p-6 shadow-sm ${failed.length || suppressedRecipients.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Delivery attention</p><p className="mt-3 text-4xl font-semibold text-navy">{Math.max(failed.length, suppressedRecipients.length)}</p><p className="mt-2 text-sm text-slate-600">{failed.length ? `${failed.length} failed sends` : "No failed sends"} · {suppressedRecipients.length} suppressed</p></article>
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Distribution activity</p><h2 className="dq-h2">Six-month delivery rhythm</h2></div><p className="text-xs text-slate-500">Provider accepted vs. confirmed delivered</p></div><div className="mt-8 grid h-56 grid-cols-6 items-end gap-3 border-b border-slate-200 px-1">{monthActivity.map((month) => <div key={month.key} className="flex h-full flex-col justify-end"><div className="flex h-[180px] items-end justify-center gap-1"><div title={`${month.sent} accepted`} className="w-4 rounded-t bg-slate-300" style={{ height: `${Math.max(month.sent ? 8 : 0, (month.sent / maxMonthly) * 100)}%` }} /><div title={`${month.delivered} delivered`} className="w-4 rounded-t bg-teal-600" style={{ height: `${Math.max(month.delivered ? 8 : 0, (month.delivered / maxMonthly) * 100)}%` }} /></div><p className="mt-3 text-center text-[10px] font-semibold text-slate-500">{month.label}</p></div>)}</div><div className="mt-5 flex gap-6 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-slate-300" />Provider accepted</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-teal-600" />Delivered</span></div></article>
      <article className="rounded-2xl border border-slate-200 bg-navy p-6 text-white shadow-sm sm:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-300">Unique engagement</p><div className="mt-4 grid grid-cols-2 gap-4"><div><p className="text-4xl font-semibold">{openedSendIds.size}</p><p className="mt-1 text-xs text-white/55">unique opens · {percent(openedSendIds.size, trackedDeliveredCount)}</p></div><div><p className="text-4xl font-semibold">{clickedSendIds.size}</p><p className="mt-1 text-xs text-white/55">unique clicks · {percent(clickedSendIds.size, trackedDeliveredCount)}</p></div></div><p className="mt-5 text-sm leading-6 text-white/70">{percent(observedEngagementSendIds.size, trackedDeliveredCount)} of {trackedDeliveredCount} ledger-confirmed deliveries have at least one recorded open or click.</p><div className="mt-6 border-t border-white/15 pt-5"><p className="text-sm font-semibold">Event history is prospective</p><p className="mt-2 text-xs leading-5 text-white/55">Unique counts use the append-only SendGrid ledger{eventTrackingStart ? ` beginning ${shortDate(eventTrackingStart)}` : " once the first event arrives"}. Opens are directional because privacy tools can load images automatically. Clicks are the stronger signal.</p></div></article>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-6 sm:p-8"><div><p className="dq-eyebrow">Edition performance</p><h2 className="dq-h2">One delivery record for each market read</h2></div><Link href="/market-iq/editions" className="text-sm font-semibold text-teal-700">Open client reports →</Link></div>{reportRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-6 py-4">Edition</th><th className="px-4 py-4">Published</th><th className="px-4 py-4">Audience</th><th className="px-4 py-4">Delivered</th><th className="px-4 py-4">Issues</th><th className="px-4 py-4">Unique opens</th><th className="px-4 py-4">Unique clicks</th><th className="px-6 py-4">Campaign</th></tr></thead><tbody className="divide-y divide-slate-100">{reportRows.map((report) => <tr key={report.id}><td className="px-6 py-4"><Link href={`/reports/market/${report.publicToken}`} className="font-semibold text-navy hover:text-teal-700">{report.periodLabel}</Link></td><td className="px-4 py-4 text-slate-500">{shortDate(report.publishedAt)}</td><td className="px-4 py-4 font-semibold text-navy">{report.audience}</td><td className="px-4 py-4"><span className="font-semibold text-teal-700">{report.delivered}</span>{report.audience > 0 && <span className="ml-1 text-xs text-slate-400">({percent(report.delivered, report.audience)})</span>}</td><td className="px-4 py-4 font-semibold text-amber-700">{report.failed}</td><td className="px-4 py-4 text-slate-600">{report.opened}</td><td className="px-4 py-4 font-semibold text-teal-700">{report.clicked}</td><td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{report.campaign?.status ?? "Not staged"}</span></td></tr>)}</tbody></table></div> : <p className="p-8 text-sm text-slate-500">No published editions fall inside this reporting window.</p>}</section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Recipient follow-up</p><h2 className="dq-h2">Addresses that need a decision</h2></div><Link href="/market-iq/distribution" className="text-sm font-semibold text-teal-700">Manage recipients →</Link></div>{followUp.length ? <div className="mt-5 divide-y divide-slate-100">{followUp.map((send) => <article key={send.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold text-navy">{send.recipient.name} <span className="font-normal text-slate-400">· {send.recipient.email}</span></p><p className="mt-1 text-xs text-slate-500">{send.report.periodLabel} · {send.recipient.kind === "client" ? "Client" : "Prospect"}</p></div><div className="text-right"><p className="text-sm font-semibold text-amber-700">{send.recipient.emailStatus === "suppressed" ? "Suppressed" : "Delivery failed"}</p><p className="mt-1 max-w-xs text-xs text-slate-400">{send.recipient.suppressionReason ?? send.deliveryError ?? latestEventLabel(send.lastEmailEventType)}</p></div></article>)}</div> : <p className="mt-5 rounded-xl bg-emerald-50 p-5 text-sm font-medium text-emerald-800">No failed or suppressed recipients need attention.</p>}</article>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"><p className="dq-eyebrow">Audience health</p><h2 className="dq-h2">{activeRecipients.length} active contacts</h2><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between border-b border-slate-200 pb-3"><dt className="text-slate-500">Clients</dt><dd className="font-semibold text-navy">{clientRecipients.length}</dd></div><div className="flex justify-between border-b border-slate-200 pb-3"><dt className="text-slate-500">Prospects</dt><dd className="font-semibold text-navy">{prospectRecipients.length}</dd></div><div className="flex justify-between border-b border-slate-200 pb-3"><dt className="text-slate-500">Suppressed</dt><dd className="font-semibold text-amber-700">{suppressedRecipients.length}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Campaigns completed</dt><dd className="font-semibold text-navy">{campaigns.filter((item) => item.status === "complete").length}</dd></div></dl></aside>
    </section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Prospect interest</p><h2 className="dq-h2">Clicks worth a personal follow-up</h2></div><p className="text-xs text-slate-500">Latest unique prospect clicks in the event ledger</p></div>{engagedProspects.length ? <div className="mt-5 divide-y divide-slate-100">{engagedProspects.map((event) => <article key={`${event.reportSend.recipient.id}:${event.reportSendId}`} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold text-navy">{event.reportSend.recipient.name} <span className="font-normal text-slate-400">· {event.reportSend.recipient.email}</span></p><p className="mt-1 text-xs text-slate-500">Clicked a Client Advisory email</p></div><div className="text-right"><p className="text-sm font-semibold text-teal-700">Explicit engagement</p><p className="mt-1 text-xs text-slate-400">{shortDate(event.occurredAt)}</p></div></article>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No prospect clicks have been recorded since event-ledger tracking began.</p>}</section>

    <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Evidence note:</strong> Delivery, bounce, suppression, open, and click evidence comes from signed SendGrid webhook events attached to Market IQ report sends. Unique engagement counts begin when the append-only event ledger is deployed and do not reconstruct earlier history. This page does not track visits to public reports or infer business outcomes from email activity.</p>
  </main>;
}
