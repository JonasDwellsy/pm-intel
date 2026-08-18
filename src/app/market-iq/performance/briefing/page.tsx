import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarketIqPrintButton } from "@/components/market-iq/performance/MarketIqPrintButton";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FAILURE_EVENTS = new Set(["bounce", "dropped", "spamreport", "unsubscribe"]);

function monthStart(value: Date, offset = 0) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1));
}

function dateLabel(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function percent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "Not available";
}

function changeLabel(current: number, prior: number) {
  if (!prior) return "No prior-month baseline";
  const change = Math.round(((current - prior) / prior) * 100);
  if (!change) return "Unchanged from prior month";
  return `${change > 0 ? "+" : ""}${change}% from prior month`;
}

type SendRow = Awaited<ReturnType<typeof loadBriefingData>>["sends"][number];

function summarizeSends(sends: SendRow[]) {
  const eventSendIds = (type: string) => new Set(sends.flatMap((send) => send.events.filter((event) => event.eventType === type).map(() => send.id)));
  const deliveredIds = eventSendIds("delivered");
  const openIds = eventSendIds("open");
  const clickIds = eventSendIds("click");
  const failedIds = new Set(sends.flatMap((send) => send.events.filter((event) => FAILURE_EVENTS.has(event.eventType)).map(() => send.id)));
  return {
    sends: sends.length,
    delivered: sends.filter((send) => Boolean(send.deliveredAt) || deliveredIds.has(send.id)).length,
    opened: openIds.size,
    clicked: clickIds.size,
    failed: sends.filter((send) => send.deliveryStatus === "failed" || failedIds.has(send.id)).length,
    clients: new Set(sends.filter((send) => send.recipient.kind === "client").map((send) => send.recipient.id)).size,
    prospects: new Set(sends.filter((send) => send.recipient.kind === "prospect").map((send) => send.recipient.id)).size,
  };
}

async function loadBriefingData(organizationId: string, priorStart: Date, periodEnd: Date) {
  const [organization, reports, sends, recipients] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, brandProfile: { select: { displayName: true } } },
    }),
    prisma.marketIqReport.findMany({
      where: { organizationId, status: "published", publishedAt: { gte: priorStart, lt: periodEnd } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, periodLabel: true, publishedAt: true, publicToken: true },
    }),
    prisma.marketIqReportSend.findMany({
      where: { organizationId, sentAt: { gte: priorStart, lt: periodEnd } },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        reportId: true,
        deliveryStatus: true,
        deliveredAt: true,
        sentAt: true,
        recipient: { select: { id: true, name: true, email: true, kind: true } },
        report: { select: { periodLabel: true, publicToken: true } },
        events: { select: { eventType: true, occurredAt: true } },
      },
    }),
    prisma.marketIqReportRecipient.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, kind: true, emailStatus: true, suppressionReason: true },
    }),
  ]);
  return { organization, reports, sends, recipients };
}

export default async function MarketIqMonthlyBriefingPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const latestSend = await prisma.marketIqReportSend.findFirst({
    where: { organizationId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const anchor = latestSend?.sentAt ?? new Date();
  const currentStart = monthStart(anchor);
  const currentEnd = monthStart(anchor, 1);
  const priorStart = monthStart(anchor, -1);
  const { organization, reports, sends, recipients } = await loadBriefingData(organizationId, priorStart, currentEnd);
  if (!organization) redirect("/setup-workspace");

  const currentSends = sends.filter((send) => send.sentAt && send.sentAt >= currentStart);
  const priorSends = sends.filter((send) => send.sentAt && send.sentAt < currentStart);
  const current = summarizeSends(currentSends);
  const prior = summarizeSends(priorSends);
  const currentReports = reports.filter((report) => report.publishedAt && report.publishedAt >= currentStart);
  const activeRecipients = recipients.filter((recipient) => recipient.emailStatus === "active");
  const suppressedRecipients = recipients.filter((recipient) => recipient.emailStatus === "suppressed");

  const distributedReports = [...new Map(currentSends.map((send) => [send.reportId, {
    id: send.reportId,
    periodLabel: send.report.periodLabel,
    publicToken: send.report.publicToken,
  }])).values()];
  const reportPerformance = distributedReports.map((report) => ({
    ...report,
    ...summarizeSends(currentSends.filter((send) => send.reportId === report.id)),
  })).sort((a, b) => b.clicked - a.clicked || b.opened - a.opened || b.delivered - a.delivered);
  const strongestReport = reportPerformance[0] ?? null;

  const clickedProspects = currentSends
    .filter((send) => send.recipient.kind === "prospect" && send.events.some((event) => event.eventType === "click"))
    .filter((send, index, all) => all.findIndex((candidate) => candidate.recipient.id === send.recipient.id) === index);

  const failedRecipients = currentSends
    .filter((send) => send.deliveryStatus === "failed" || send.events.some((event) => FAILURE_EVENTS.has(event.eventType)))
    .filter((send, index, all) => all.findIndex((candidate) => candidate.recipient.id === send.recipient.id) === index);
  const attentionRecipientIds = new Set([...failedRecipients.map((send) => send.recipient.id), ...suppressedRecipients.map((recipient) => recipient.id)]);

  const firmName = organization.brandProfile?.displayName ?? organization.name;
  const period = dateLabel(currentStart);

  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12 print:max-w-none print:px-0 print:py-0">
    <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500 print:hidden"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href="/market-iq/performance" className="hover:text-teal-700">Performance</Link><span>/</span><span>Monthly briefing</span></nav>

    <header className="mt-6 flex flex-wrap items-end justify-between gap-6 border-b border-grid pb-8 print:mt-0">
      <div><p className="dq-eyebrow">Client Advisory results</p><h1 className="dq-h1">{period} briefing</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">A concise account-management read for {firmName}, based on confirmed distribution and engagement evidence.</p></div>
      <div className="flex items-center gap-3"><MarketIqPrintButton /><Link href="/market-iq/performance" className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white print:hidden">Open dashboard</Link></div>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Published</p><p className="mt-3 text-4xl font-semibold text-navy">{currentReports.length}</p><p className="mt-2 text-sm text-slate-500">{currentReports.length === 1 ? "client-ready edition" : "client-ready editions"}</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Delivered</p><p className="mt-3 text-4xl font-semibold text-navy">{current.delivered}</p><p className="mt-2 text-sm text-slate-500">{percent(current.delivered, current.sends)} of {current.sends} accepted sends</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Unique clicks</p><p className="mt-3 text-4xl font-semibold text-navy">{current.clicked}</p><p className="mt-2 text-sm text-slate-500">{percent(current.clicked, current.delivered)} of confirmed deliveries</p></article>
      <article className={`rounded-2xl border p-6 ${current.failed || suppressedRecipients.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Needs attention</p><p className="mt-3 text-4xl font-semibold text-navy">{attentionRecipientIds.size}</p><p className="mt-2 text-sm text-slate-600">failed or suppressed contacts</p></article>
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="dq-eyebrow">What happened</p><h2 className="dq-h2">The month in plain language</h2><div className="mt-5 space-y-4 text-base leading-7 text-slate-600">
        {current.sends ? <p>{current.delivered} of {current.sends} accepted emails have confirmed delivery. {current.opened} recipients opened an email and {current.clicked} clicked through to the market read.</p> : <p>No Client Advisory email was sent in {period}. The briefing will populate after the first individually approved delivery.</p>}
        <p>Distribution volume is {changeLabel(current.sends, prior.sends).toLowerCase()}. Client sends accounted for {current.clients} deliveries in the audience, while prospects accounted for {current.prospects}.</p>
        {strongestReport ? <p>The strongest edition was <Link href={`/reports/market/${strongestReport.publicToken}`} className="font-semibold text-teal-700">{strongestReport.periodLabel}</Link>, with {strongestReport.clicked} unique {strongestReport.clicked === 1 ? "click" : "clicks"} and {strongestReport.opened} unique {strongestReport.opened === 1 ? "open" : "opens"}.</p> : <p>No edition has enough current-period distribution evidence to identify a leader.</p>}
      </div></article>

      <aside className="rounded-2xl bg-navy p-6 text-white sm:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-300">Audience</p><h2 className="mt-2 text-2xl font-semibold">{activeRecipients.length} active contacts</h2><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between border-b border-white/15 pb-3"><dt className="text-white/60">Clients reached</dt><dd className="font-semibold">{current.clients}</dd></div><div className="flex justify-between border-b border-white/15 pb-3"><dt className="text-white/60">Prospects reached</dt><dd className="font-semibold">{current.prospects}</dd></div><div className="flex justify-between border-b border-white/15 pb-3"><dt className="text-white/60">Unique opens</dt><dd className="font-semibold">{current.opened}</dd></div><div className="flex justify-between"><dt className="text-white/60">Suppressed contacts</dt><dd className="font-semibold">{suppressedRecipients.length}</dd></div></dl></aside>
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="dq-eyebrow">Where to follow up</p><h2 className="dq-h2">Prospects who clicked</h2>{clickedProspects.length ? <div className="mt-5 divide-y divide-slate-100">{clickedProspects.map((send) => <div key={send.recipient.id} className="py-4"><p className="font-semibold text-navy">{send.recipient.name}</p><p className="mt-1 text-sm text-slate-500">{send.recipient.email} · {send.report.periodLabel}</p></div>)}</div> : <p className="mt-5 text-sm leading-6 text-slate-500">No prospect clicks were recorded in {period}. Clicks are the clearest signal for a personal follow-up.</p>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="dq-eyebrow">Delivery cleanup</p><h2 className="dq-h2">Contacts to review</h2>{failedRecipients.length || suppressedRecipients.length ? <div className="mt-5 divide-y divide-slate-100">{failedRecipients.map((send) => <div key={send.recipient.id} className="py-4"><p className="font-semibold text-navy">{send.recipient.name}</p><p className="mt-1 text-sm text-amber-700">Delivery failed · {send.recipient.email}</p></div>)}{suppressedRecipients.slice(0, 6).map((recipient) => <div key={recipient.id} className="py-4"><p className="font-semibold text-navy">{recipient.name}</p><p className="mt-1 text-sm text-amber-700">Suppressed · {recipient.suppressionReason ?? recipient.email}</p></div>)}</div> : <p className="mt-5 text-sm leading-6 text-slate-500">No failed or suppressed contacts need attention.</p>}</article>
    </section>

    <section className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 p-6 sm:p-8"><p className="dq-eyebrow">Next month</p><h2 className="dq-h2">Recommended operating plan</h2><ol className="mt-5 grid gap-4 text-sm leading-6 text-slate-700 md:grid-cols-3"><li className="rounded-xl bg-white p-5"><strong className="block text-navy">1. Follow the explicit signal</strong><span className="mt-2 block">Contact {clickedProspects.length || "any"} engaged {clickedProspects.length === 1 ? "prospect" : "prospects"} while the local market read is still current.</span></li><li className="rounded-xl bg-white p-5"><strong className="block text-navy">2. Protect deliverability</strong><span className="mt-2 block">Resolve failed addresses and leave suppressed contacts out of the next distribution.</span></li><li className="rounded-xl bg-white p-5"><strong className="block text-navy">3. Prepare the next edition</strong><span className="mt-2 block">Review the new market evidence, add your local point of view, and approve each recipient deliberately.</span></li></ol></section>

    <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500"><strong className="text-slate-700">How to read this briefing:</strong> Delivery, bounce, suppression, open, and click evidence comes from signed SendGrid events attached to Market IQ report sends. Opens are directional because privacy tools can load images automatically. Clicks are the stronger signal. Event-ledger history begins prospectively and does not reconstruct earlier activity.</footer>
  </main>;
}
