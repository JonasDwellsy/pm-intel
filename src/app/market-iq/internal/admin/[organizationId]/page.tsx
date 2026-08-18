import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { MarketIqCommercialAccessForm } from "@/components/admin/MarketIqCommercialAccessForm";
import { MarketIqWorkspaceSupportForm } from "@/components/admin/MarketIqWorkspaceSupportForm";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "Not recorded";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}

export default async function MarketIqWorkspaceSupportPage({ params }: { params: Promise<{ organizationId: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();
  const { organizationId } = await params;
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, personalForUserId: null },
    select: {
      id: true, clerkOrgId: true, name: true, createdAt: true,
      memberships: { orderBy: { createdAt: "asc" }, select: { userId: true, role: true, createdAt: true } },
      brandProfile: true,
      marketIqWorkspacePreference: true,
      marketIqSubscriptions: { orderBy: { createdAt: "desc" }, include: { markets: { select: { marketId: true } } } },
      marketIqReports: { orderBy: { createdAt: "desc" }, take: 12, select: { id: true, publicToken: true, status: true, periodLabel: true, publishedAt: true, createdAt: true } },
      marketIqTestDeliveries: { orderBy: { createdAt: "desc" }, take: 8, select: { id: true, status: true, error: true, sentAt: true, createdAt: true } },
      marketIqReportRecipients: { where: { emailStatus: "active" }, select: { id: true, kind: true, createdAt: true } },
      marketIqDistributionCampaigns: { orderBy: { createdAt: "desc" }, take: 8, select: { id: true, status: true, createdAt: true, completedAt: true, report: { select: { periodLabel: true } }, _count: { select: { recipients: true } } } },
      marketIqReportSends: { orderBy: { createdAt: "desc" }, take: 12, select: { id: true, deliveryStatus: true, sentAt: true, deliveredAt: true, lastEmailEventType: true, createdAt: true, report: { select: { periodLabel: true } } } },
      marketIqJourneyEvents: { orderBy: { occurredAt: "desc" }, take: 30, select: { id: true, eventKey: true, milestone: true, status: true, sourceRoute: true, occurredAt: true } },
      marketIqSupportState: { include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } },
    },
  });
  if (!organization) notFound();

  const [usage, markets] = await Promise.all([
    prisma.usageEvent.findMany({ where: { orgId: organization.clerkOrgId, eventName: { in: ["market_iq_page_view", "login"] }, occurredAt: { gte: since } }, orderBy: { occurredAt: "desc" }, select: { eventName: true, userId: true, targetSlug: true, occurredAt: true } }),
    prisma.market.findMany({ select: { id: true, city: true, state: true }, orderBy: [{ state: "asc" }, { city: "asc" }] }),
  ]);
  const identityIds = [...new Set([
    ...organization.memberships.map((membership) => membership.userId),
    ...(organization.marketIqSupportState?.events.map((event) => event.actorUserId) ?? []),
    ...(organization.marketIqSupportState ? [organization.marketIqSupportState.updatedByUserId] : []),
  ])];
  const identities = new Map<string, { name: string; email: string }>();
  const pendingInvitations: Array<{ id: string; email: string; role: string; createdAt: Date; expiresAt: Date }> = [];
  try {
    const client = await clerkClient();
    const invitationResult = await client.organizations.getOrganizationInvitationList({ organizationId: organization.clerkOrgId, status: ["pending"], limit: 100 });
    invitationResult.data.forEach((invitation) => pendingInvitations.push({
      id: invitation.id,
      email: invitation.emailAddress,
      role: invitation.role,
      createdAt: new Date(invitation.createdAt),
      expiresAt: new Date(invitation.expiresAt),
    }));
    if (identityIds.length) {
      const result = await client.users.getUserList({ userId: identityIds, limit: Math.min(identityIds.length, 500) });
      result.data.forEach((person) => identities.set(person.id, {
        name: [person.firstName, person.lastName].filter(Boolean).join(" ") || "Unnamed user",
        email: person.emailAddresses.find((item) => item.id === person.primaryEmailAddressId)?.emailAddress ?? person.emailAddresses[0]?.emailAddress ?? "No email",
      }));
    }
  } catch { /* Clerk access enrichment is best effort. */ }
  const subscription = organization.marketIqSubscriptions[0] ?? null;
  const latestReport = organization.marketIqReports.find((report) => report.status === "published") ?? null;
  const latestTest = organization.marketIqTestDeliveries[0] ?? null;
  const latestCampaign = organization.marketIqDistributionCampaigns[0] ?? null;
  const latestSend = organization.marketIqReportSends[0] ?? null;
  const checks = [
    { name: "Commercial access", complete: Boolean(subscription && ["active", "trialing"].includes(subscription.status)), detail: subscription ? `${label(subscription.planKey)} · ${subscription.status}` : "No Market IQ subscription" },
    { name: "Workspace setup", complete: Boolean(organization.brandProfile && organization.marketIqWorkspacePreference?.onboardingCompletedAt), detail: organization.marketIqWorkspacePreference?.onboardingCompletedAt ? `Completed ${dateTime(organization.marketIqWorkspacePreference.onboardingCompletedAt)}` : "Brand and market defaults are incomplete" },
    { name: "Published report", complete: Boolean(latestReport), detail: latestReport ? `${latestReport.periodLabel} · ${dateTime(latestReport.publishedAt)}` : "No published client report" },
    { name: "Safe test", complete: latestTest?.status === "accepted", detail: latestTest ? `${latestTest.status} · ${dateTime(latestTest.sentAt ?? latestTest.createdAt)}` : "No test email attempted" },
    { name: "Recipient directory", complete: organization.marketIqReportRecipients.length > 0, detail: `${organization.marketIqReportRecipients.length} active recipients` },
    { name: "Audience prepared", complete: Boolean(latestCampaign && latestCampaign._count.recipients > 0), detail: latestCampaign ? `${latestCampaign._count.recipients} recipients · ${latestCampaign.status}` : "No campaign prepared" },
    { name: "Customer delivery", complete: Boolean(latestSend && (latestSend.deliveredAt || latestSend.deliveryStatus === "sent")), detail: latestSend ? `${latestSend.deliveryStatus} · ${dateTime(latestSend.deliveredAt ?? latestSend.sentAt ?? latestSend.createdAt)}` : "No customer delivery" },
  ];
  const pageViews = usage.filter((event) => event.eventName === "market_iq_page_view");
  const lastUseByUser = new Map<string, Date>();
  const lastLoginByUser = new Map<string, Date>();
  usage.forEach((event) => {
    const target = event.eventName === "login" ? lastLoginByUser : lastUseByUser;
    if (!target.has(event.userId)) target.set(event.userId, event.occurredAt);
  });
  const pageCounts = new Map<string, number>();
  pageViews.forEach((event) => pageCounts.set(event.targetSlug ?? "other", (pageCounts.get(event.targetSlug ?? "other") ?? 0) + 1));
  const commercialMarkets = markets.map((market) => ({ id: market.id, label: `${market.city}, ${market.state}` }));

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="text-xs font-semibold text-slate-500"><Link href="/market-iq/internal/admin">Market IQ admin</Link><span className="mx-2">/</span><span>{organization.brandProfile?.displayName ?? organization.name}</span></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Workspace support</p><h1 className="dq-h1">{organization.brandProfile?.displayName ?? organization.name}</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">A support view of access, setup, product use, and report delivery. Customer content remains outside this page.</p></div><aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Activation</p><p className="mt-3 text-3xl font-semibold">{checks.filter((check) => check.complete).length} of 7</p><p className="mt-2 text-sm leading-6 text-white/70">{checks.find((check) => !check.complete)?.name ?? "First delivery complete"}</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active members" value={organization.memberships.length} /><Metric label="Pending invitations" value={pendingInvitations.length} /><Metric label="Views · 30 days" value={pageViews.length} /><Metric label="Active users · 30 days" value={new Set(pageViews.map((event) => event.userId)).size} /></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Recovery path</p><h2 className="dq-h2">Activation checks</h2><div className="mt-5 divide-y divide-slate-100">{checks.map((check) => <article key={check.name} className="grid grid-cols-[32px_1fr] gap-3 py-3"><span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${check.complete ? "bg-emerald-600 text-white" : "border border-orange-200 bg-orange-50 text-orange-800"}`}>{check.complete ? "✓" : "·"}</span><div><p className="text-sm font-semibold text-navy">{check.name}</p><p className="mt-1 text-xs text-slate-500">{check.detail}</p></div></article>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="dq-eyebrow">Product use</p><h2 className="dq-h2">Where the team is working</h2><div className="mt-5 flex flex-wrap gap-2">{[...pageCounts.entries()].sort((a,b) => b[1]-a[1]).map(([page, count]) => <span key={page} className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-600"><b className="text-navy">{count}</b> {page.replaceAll("_", " ")}</span>)}{!pageViews.length && <p className="text-sm text-slate-500">No signed-in Market IQ page views have been recorded in the last 30 days.</p>}</div><div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent activity</p><div className="mt-2 divide-y divide-slate-100">{pageViews.slice(0, 8).map((event, index) => <div key={`${event.occurredAt.toISOString()}-${index}`} className="flex justify-between gap-3 py-3 text-xs"><span className="font-semibold text-navy">{label(event.targetSlug ?? "Market IQ")}</span><span className="text-slate-500">{dateTime(event.occurredAt)}</span></div>)}</div></div></div></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_.9fr]"><div><p className="dq-eyebrow">Customer success</p><h2 className="dq-h2">Assignment and follow-up</h2><p className="mt-2 mb-4 text-sm text-slate-600">Record the internal owner, next follow-up, and current support status.</p><MarketIqWorkspaceSupportForm organizationId={organization.id} supportState={organization.marketIqSupportState ? { status: organization.marketIqSupportState.status, assignedTo: organization.marketIqSupportState.assignedTo, followUpAt: organization.marketIqSupportState.followUpAt?.toISOString() ?? null, latestNote: organization.marketIqSupportState.latestNote } : null} /></div><div><p className="dq-eyebrow">Private history</p><h2 className="dq-h2">Support interventions</h2><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">{organization.marketIqSupportState?.events.length ? <div className="divide-y divide-slate-100">{organization.marketIqSupportState.events.map((event) => <article key={event.id} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold capitalize text-navy">{event.action.replaceAll("_", " ")}</p><span className="text-xs text-slate-500">{dateTime(event.createdAt)}</span></div><p className="mt-1 text-xs text-slate-500">{event.assignedTo ? `Assigned to ${event.assignedTo} · ` : ""}{event.toStatus}{event.followUpAt ? ` · follow up ${dateTime(event.followUpAt)}` : ""}</p>{event.note && <p className="mt-2 text-sm leading-6 text-slate-700">{event.note}</p>}<p className="mt-2 text-[11px] text-slate-400">Recorded by {identities.get(event.actorUserId)?.name ?? "Dwellsy staff"}</p></article>)}</div> : <p className="px-5 py-8 text-sm text-slate-500">No internal support updates have been recorded.</p>}</div></div></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-2"><div><h2 className="dq-h2">Members and invitations</h2><p className="mt-2 mb-4 text-sm text-slate-600">Invitations are sent only after an administrator clicks the button below.</p><InviteUserForm clerkOrgId={organization.clerkOrgId} /><div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="divide-y divide-slate-100">{pendingInvitations.map((invitation) => <article key={invitation.id} className="grid gap-3 bg-amber-50/60 px-4 py-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold text-navy">{invitation.email}</p><p className="mt-1 text-xs text-slate-500">Invited {dateTime(invitation.createdAt)} · expires {dateTime(invitation.expiresAt)}</p></div><span className="self-start rounded-full bg-amber-100 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-900">Pending · {invitation.role.replace("org:", "")}</span></article>)}{organization.memberships.map((membership) => { const identity = identities.get(membership.userId); const lastUse = lastUseByUser.get(membership.userId); const lastLogin = lastLoginByUser.get(membership.userId); return <article key={membership.userId} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold text-navy">{identity?.name ?? membership.userId}</p><p className="mt-1 text-xs text-slate-500">{identity?.email ?? "Identity unavailable"}</p><p className="mt-1 text-[11px] text-slate-400">Last Market IQ use: {dateTime(lastUse)} · last sign-in: {dateTime(lastLogin)}</p></div><span className="self-start rounded-full bg-slate-100 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{membership.role.replace("org:", "")}</span></article>; })}</div></div></div><div><h2 className="dq-h2">Commercial access</h2><p className="mt-2 mb-4 text-sm text-slate-600">Provision contracted customers here. Stripe subscriptions remain managed in Stripe.</p><MarketIqCommercialAccessForm orgId={organization.id} markets={commercialMarkets} subscriptions={organization.marketIqSubscriptions.map((item) => ({ id: item.id, source: item.source, status: item.status, planKey: item.planKey, currentPeriodEnd: item.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: item.cancelAtPeriodEnd, markets: item.markets }))} /></div></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-2"><History title="Journey history" empty="No journey events recorded." items={organization.marketIqJourneyEvents.map((event) => ({ id: event.id, title: label(event.eventKey), detail: `${event.status} · ${event.sourceRoute ?? "System"}`, date: event.occurredAt }))} /><History title="Delivery history" empty="No customer deliveries recorded." items={organization.marketIqReportSends.map((send) => ({ id: send.id, title: send.report.periodLabel, detail: `${send.deliveryStatus}${send.lastEmailEventType ? ` · ${send.lastEmailEventType}` : ""}`, date: send.deliveredAt ?? send.sentAt ?? send.createdAt }))} /></section>
  </main>;
}

function Metric({ label: metricLabel, value }: { label: string; value: number }) { return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{metricLabel}</p><p className="mt-3 text-3xl font-semibold text-navy">{value}</p></article>; }
function History({ title, items, empty }: { title: string; empty: string; items: Array<{ id: string; title: string; detail: string; date: Date }> }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-6 py-5"><h2 className="dq-h2">{title}</h2></div>{items.length ? <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="grid gap-1 px-6 py-4 sm:grid-cols-[1fr_180px]"><div><p className="text-sm font-semibold text-navy">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div><p className="text-xs text-slate-500 sm:text-right">{dateTime(item.date)}</p></article>)}</div> : <p className="px-6 py-8 text-sm text-slate-500">{empty}</p>}</section>; }
