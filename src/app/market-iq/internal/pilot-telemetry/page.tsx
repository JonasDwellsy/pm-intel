import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MILESTONES = [
  { key: "access", label: "Access" },
  { key: "setup", label: "Setup" },
  { key: "edition", label: "Edition" },
  { key: "test", label: "Test" },
  { key: "recipient", label: "Recipient" },
  { key: "audience", label: "Audience" },
  { key: "delivery", label: "Delivery" },
] as const;

function dateTime(value: Date | null | undefined) {
  return value
    ? value.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
    : "No activity";
}

function eventLabel(eventKey: string) {
  return eventKey.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default async function MarketIqPilotTelemetryPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();

  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { productAccess: { some: { productKey: "market_iq" } } },
        { marketIqSubscriptions: { some: {} } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      brandProfile: { select: { displayName: true } },
      marketIqWorkspacePreference: { select: { onboardingCompletedAt: true, updatedAt: true } },
      marketIqSubscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { source: true, status: true, planKey: true, billingInterval: true, updatedAt: true },
      },
      marketIqReports: {
        where: { status: "published", generatedBy: { notIn: ["preview-bootstrap", "market-iq-baseline"] } },
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { id: true, periodLabel: true, publishedAt: true },
      },
      marketIqTestDeliveries: {
        where: { status: "accepted" },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { id: true, sentAt: true },
      },
      marketIqReportRecipients: {
        where: { emailStatus: "active" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, createdAt: true },
      },
      marketIqDistributionCampaigns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true, _count: { select: { recipients: true } } },
      },
      marketIqReportSends: {
        where: { OR: [{ deliveryStatus: "sent" }, { deliveredAt: { not: null } }] },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, sentAt: true, deliveredAt: true, createdAt: true },
      },
      marketIqJourneyEvents: {
        orderBy: { occurredAt: "desc" },
        take: 12,
        select: { id: true, eventKey: true, milestone: true, status: true, sourceRoute: true, occurredAt: true },
      },
    },
  });

  const rows = organizations.map((organization) => {
    const subscription = organization.marketIqSubscriptions[0] ?? null;
    const report = organization.marketIqReports[0] ?? null;
    const test = organization.marketIqTestDeliveries[0] ?? null;
    const recipient = organization.marketIqReportRecipients[0] ?? null;
    const campaign = organization.marketIqDistributionCampaigns[0] ?? null;
    const delivery = organization.marketIqReportSends[0] ?? null;
    const completed = {
      access: Boolean(subscription && ["active", "trialing"].includes(subscription.status)),
      setup: Boolean(organization.brandProfile && organization.marketIqWorkspacePreference?.onboardingCompletedAt),
      edition: Boolean(report),
      test: Boolean(test),
      recipient: Boolean(recipient),
      audience: Boolean(campaign && campaign._count.recipients > 0),
      delivery: Boolean(delivery),
    };
    const next = MILESTONES.find((milestone) => !completed[milestone.key]);
    const datedActivity = [
      organization.marketIqJourneyEvents[0]?.occurredAt,
      delivery?.deliveredAt ?? delivery?.sentAt ?? delivery?.createdAt,
      campaign?.createdAt,
      recipient?.createdAt,
      test?.sentAt,
      report?.publishedAt,
      organization.marketIqWorkspacePreference?.updatedAt,
      subscription?.updatedAt,
    ].filter((value): value is Date => Boolean(value));
    return {
      ...organization,
      subscription,
      report,
      completed,
      completedCount: Object.values(completed).filter(Boolean).length,
      nextLabel: next?.label ?? "Complete",
      lastActivity: datedActivity.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  }).sort((a, b) => {
    if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
    return (a.lastActivity?.getTime() ?? 0) - (b.lastActivity?.getTime() ?? 0);
  });
  const completedCount = rows.filter((row) => row.completedCount === MILESTONES.length).length;
  const stalledCount = rows.filter((row) => row.completedCount < MILESTONES.length).length;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="text-xs font-semibold text-slate-500"><Link href="/market-iq/internal/readiness">Internal diagnostics</Link><span className="mx-2">/</span><Link href="/market-iq/internal/admin">Market IQ admin</Link><span className="mx-2">/</span><span>Pilot telemetry</span></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Dwellsy internal</p><h1 className="dq-h1">Market IQ pilot journey</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">A workspace-level view of the explicit steps from commercial access through the first confirmed customer delivery. The journey ledger excludes report content, recipient addresses, and market-data selections.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Pilot status</p><p className="mt-3 text-2xl font-semibold">{completedCount} complete · {stalledCount} in progress</p><p className="mt-2 text-sm leading-6 text-white/70">Workspaces are ordered by the earliest unfinished journey.</p></aside>
    </header>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(190px,1.25fr)_140px_repeat(7,62px)_130px] gap-2 border-b border-slate-200 bg-slate-50 px-6 py-3 text-[9px] font-bold uppercase tracking-wider text-slate-500 xl:grid">
        <span>Workspace</span><span>Next step</span>{MILESTONES.map((milestone) => <span key={milestone.key} className="text-center">{milestone.label}</span>)}<span className="text-right">Last activity</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => <article key={row.id} className="px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(190px,1.25fr)_140px_repeat(7,62px)_130px] xl:items-center xl:gap-2">
            <div><p className="font-semibold text-navy">{row.brandProfile?.displayName ?? row.name}</p><p className="mt-1 text-xs text-slate-500">{row.subscription ? `${row.subscription.source} · ${row.subscription.planKey} · ${row.subscription.status}` : "No subscription record"}</p></div>
            <div><span className={row.nextLabel === "Complete" ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800" : "rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-orange-800"}>{row.nextLabel}</span></div>
            <div className="grid grid-cols-7 gap-2 xl:contents">{MILESTONES.map((milestone) => <div key={milestone.key} className="text-center"><span className={row.completed[milestone.key] ? "inline-flex size-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white" : "inline-flex size-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-300"}>{row.completed[milestone.key] ? "✓" : "·"}</span><span className="mt-1 block text-[8px] font-semibold uppercase text-slate-400 xl:hidden">{milestone.label}</span></div>)}</div>
            <p className="text-xs text-slate-500 xl:text-right">{dateTime(row.lastActivity)}</p>
          </div>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-navy">Recent journey events ({row.marketIqJourneyEvents.length})</summary><div className="mt-3 divide-y divide-slate-200">{row.marketIqJourneyEvents.length ? row.marketIqJourneyEvents.map((event) => <div key={event.id} className="grid gap-1 py-3 text-xs sm:grid-cols-[1fr_100px_160px]"><div><p className="font-semibold text-navy">{eventLabel(event.eventKey)}</p><p className="mt-1 text-slate-500">{event.sourceRoute ?? "System"}</p></div><span className={event.status === "completed" ? "text-emerald-700" : event.status === "failed" ? "text-rose-700" : "text-amber-700"}>{event.status}</span><span className="text-slate-500 sm:text-right">{dateTime(event.occurredAt)}</span></div>) : <p className="py-3 text-xs text-slate-500">No new telemetry events yet. The milestone row above is reconciled from existing business records.</p>}</div></details>
        </article>)}
        {!rows.length && <p className="px-6 py-12 text-center text-sm text-slate-500">No Market IQ workspaces are provisioned.</p>}
      </div>
    </section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Privacy boundary</p><p className="mt-2 text-sm leading-6 text-slate-600">This journey view records business milestones and operational failures only. Separate aggregate traffic counts appear in Market IQ admin, but neither system stores client and prospect email addresses, report narratives, market selections, or query strings.</p></section>
  </main>;
}
