import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { CreateOrganizationForm } from "@/components/admin/CreateOrganizationForm";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { MarketIqCommercialAccessForm } from "@/components/admin/MarketIqCommercialAccessForm";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["active", "trialing"];
const JOURNEY_STEPS = ["access", "setup", "edition", "test", "recipient", "audience", "delivery"];

function shortDate(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "None";
}

function ageInHours(value: Date | null | undefined) {
  return value ? (Date.now() - value.getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
}

function recoverySignal(input: {
  active: boolean;
  setupAt: Date | null;
  reportAt: Date | null;
  testStatus: string | null;
  testAt: Date | null;
  recipientAt: Date | null;
  campaignStatus: string | null;
  campaignAt: Date | null;
  sendStatus: string | null;
  lastActivity: Date | null;
}) {
  if (!input.active) return null;
  if (input.sendStatus === "failed") return { priority: 100, level: "Critical", reason: "Latest customer delivery failed", action: "Review the delivery error" };
  if (input.testStatus === "failed") return { priority: 95, level: "Critical", reason: "Latest test email failed", action: "Review the test-send error" };
  if (input.campaignStatus === "partial") return { priority: 90, level: "Critical", reason: "Latest delivery completed with failures", action: "Review failed recipients" };
  if (!input.setupAt && ageInHours(input.lastActivity) > 72) return { priority: 85, level: "High", reason: "Setup has not been completed", action: "Check access and onboarding" };
  if (!input.setupAt && ageInHours(input.lastActivity) > 24) return { priority: 75, level: "High", reason: "Setup has not been completed", action: "Check onboarding progress" };
  if (input.setupAt && !input.reportAt && ageInHours(input.setupAt) > 24) return { priority: 70, level: "High", reason: "First report has not been published", action: "Review edition readiness" };
  if (input.recipientAt && !input.campaignAt && ageInHours(input.recipientAt) > 24) return { priority: 60, level: "Medium", reason: "Recipient saved, but no delivery was prepared", action: "Check the sharing workflow" };
  if (input.reportAt && !input.testAt && ageInHours(input.reportAt) > 24) return { priority: 55, level: "Medium", reason: "Report has not been test-sent", action: "Confirm report and sender setup" };
  if (ageInHours(input.lastActivity) > 24 * 7) return { priority: 40, level: "Monitor", reason: "No Market IQ activity in seven days", action: "Confirm the customer is active" };
  return null;
}

export default async function MarketIqInternalAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();
  const query = await searchParams;
  const severityFilter = typeof query.severity === "string" ? query.severity : "all";
  const statusFilter = typeof query.supportStatus === "string" ? query.supportStatus : "all";
  const planFilter = typeof query.plan === "string" ? query.plan : "all";
  const ownerFilter = typeof query.owner === "string" ? query.owner.trim().toLowerCase() : "";

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [organizations, markets, usage] = await Promise.all([
    prisma.organization.findMany({
      where: { personalForUserId: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, clerkOrgId: true, name: true, createdAt: true,
        memberships: { select: { userId: true, role: true } },
        brandProfile: { select: { displayName: true } },
        marketIqWorkspacePreference: { select: { onboardingCompletedAt: true } },
        marketIqSubscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { markets: { select: { marketId: true } } } },
        marketIqReports: { where: { status: "published" }, orderBy: { publishedAt: "desc" }, take: 1, select: { publishedAt: true } },
        marketIqTestDeliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, sentAt: true, createdAt: true } },
        marketIqReportRecipients: { where: { emailStatus: "active" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
        marketIqDistributionCampaigns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } },
        marketIqReportSends: { orderBy: { createdAt: "desc" }, take: 1, select: { deliveryStatus: true, createdAt: true, sentAt: true, deliveredAt: true } },
        marketIqJourneyEvents: { orderBy: { occurredAt: "desc" }, take: 40, select: { milestone: true, status: true, occurredAt: true } },
        marketIqSupportState: { select: { status: true, assignedTo: true, followUpAt: true, updatedAt: true } },
      },
    }),
    prisma.market.findMany({ select: { id: true, city: true, state: true }, orderBy: [{ state: "asc" }, { city: "asc" }] }),
    prisma.usageEvent.findMany({
      where: { eventName: "market_iq_page_view", occurredAt: { gte: thirtyDaysAgo } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, userId: true, orgId: true, targetSlug: true },
    }),
  ]);

  const userIds = [...new Set([...organizations.flatMap((org) => org.memberships.map((m) => m.userId)), ...usage.map((event) => event.userId)])];
  const userNames = new Map<string, string>();
  if (userIds.length) {
    try {
      const client = await clerkClient();
      const result = await client.users.getUserList({ userId: userIds, limit: Math.min(userIds.length, 500) });
      result.data.forEach((user) => userNames.set(user.id, [user.firstName, user.lastName].filter(Boolean).join(" ") || user.id));
    } catch { /* Clerk identity is enrichment only. */ }
  }

  const usageByOrg = new Map<string, typeof usage>();
  usage.forEach((event) => {
    if (!event.orgId) return;
    usageByOrg.set(event.orgId, [...(usageByOrg.get(event.orgId) ?? []), event]);
  });
  const rows = organizations.map((org) => {
    const orgUsage = usageByOrg.get(org.clerkOrgId) ?? [];
    const subscription = org.marketIqSubscriptions[0] ?? null;
    const reportAt = org.marketIqReports[0]?.publishedAt ?? null;
    const test = org.marketIqTestDeliveries[0] ?? null;
    const recipientAt = org.marketIqReportRecipients[0]?.createdAt ?? null;
    const campaign = org.marketIqDistributionCampaigns[0] ?? null;
    const send = org.marketIqReportSends[0] ?? null;
    const lastActivity = [orgUsage[0]?.occurredAt, org.marketIqJourneyEvents[0]?.occurredAt, send?.deliveredAt, send?.sentAt, send?.createdAt, campaign?.createdAt, recipientAt, test?.sentAt, test?.createdAt, reportAt, org.createdAt].filter((v): v is Date => Boolean(v)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const completed = new Set(org.marketIqJourneyEvents.filter((event) => event.status === "completed").map((event) => event.milestone));
    const active = Boolean(subscription && ACTIVE_STATUSES.includes(subscription.status));
    const detectedRecovery = recoverySignal({ active, setupAt: org.marketIqWorkspacePreference?.onboardingCompletedAt ?? null, reportAt, testStatus: test?.status ?? null, testAt: test?.sentAt ?? null, recipientAt, campaignStatus: campaign?.status ?? null, campaignAt: campaign?.createdAt ?? null, sendStatus: send?.deliveryStatus ?? null, lastActivity });
    const resolvedAfterSignal = org.marketIqSupportState?.status === "resolved" && Boolean(lastActivity && org.marketIqSupportState.updatedAt >= lastActivity);
    return {
      ...org, subscription, active, reportAt, lastActivity,
      views7: orgUsage.filter((event) => event.occurredAt >= sevenDaysAgo).length,
      views30: orgUsage.length,
      users30: new Set(orgUsage.map((event) => event.userId)).size,
      progress: JOURNEY_STEPS.filter((step) => completed.has(step)).length,
      recovery: resolvedAfterSignal ? null : detectedRecovery,
    };
  });
  const activeRows = rows.filter((row) => row.active);
  const recoveryRows = rows.filter((row): row is typeof row & { recovery: NonNullable<typeof row.recovery> } => Boolean(row.recovery)).sort((a, b) => b.recovery.priority - a.recovery.priority || (a.lastActivity?.getTime() ?? 0) - (b.lastActivity?.getTime() ?? 0));
  const criticalRows = recoveryRows.filter((row) => row.recovery.level === "Critical");
  const queueRows = recoveryRows.filter((row) => {
    if (severityFilter !== "all" && row.recovery.level.toLowerCase() !== severityFilter) return false;
    if (statusFilter !== "all" && (row.marketIqSupportState?.status ?? "open") !== statusFilter) return false;
    if (planFilter !== "all" && !row.subscription?.planKey.includes(planFilter)) return false;
    if (ownerFilter && !(row.marketIqSupportState?.assignedTo ?? "").toLowerCase().includes(ownerFilter)) return false;
    return true;
  });
  const pageCounts = new Map<string, number>();
  usage.forEach((event) => pageCounts.set(event.targetSlug ?? "other", (pageCounts.get(event.targetSlug ?? "other") ?? 0) + 1));
  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getTime() - (13 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), count: usage.filter((event) => event.occurredAt.toISOString().slice(0, 10) === key).length };
  });
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));
  const commercialMarkets = markets.map((market) => ({ id: market.id, label: `${market.city}, ${market.state}` }));

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq/internal/readiness">Internal diagnostics</Link><span>/</span><span>Market IQ admin</span><span>/</span><Link href="/market-iq/internal/briefing-email-runs" className="text-teal-700">Briefing email checks</Link></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Dwellsy internal</p><h1 className="dq-h1">Market IQ operations</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Provision customer workspaces, see where onboarding has stalled, and understand how the signed-in product is being used.</p></div><aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Needs attention</p><p className="mt-3 text-3xl font-semibold">{recoveryRows.length}</p><p className="mt-2 text-sm leading-6 text-white/70">of {activeRows.length} active workspaces have a recoverable next step.</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active workspaces" value={activeRows.length} /><Metric label="Critical issues" value={criticalRows.length} /><Metric label="Active users · 30 days" value={new Set(usage.map((event) => event.userId)).size} /><Metric label="First delivery complete" value={rows.filter((row) => row.progress === 7).length} /></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_.95fr]"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Provisioning</p><h2 className="dq-h2">Create a customer workspace</h2><p className="mt-2 mb-5 text-sm leading-6 text-slate-600">Create the organization in Clerk first. Once its webhook mirror appears below, invite the customer and grant Market IQ access.</p><CreateOrganizationForm /></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Traffic · last 14 days</p><h2 className="dq-h2">Signed-in product use</h2><div className="mt-6 flex h-36 items-end gap-2">{daily.map((day) => <div key={day.key} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-semibold text-slate-500">{day.count || ""}</span><div className="w-full rounded-t bg-teal-700" style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / maxDaily) * 100)}%` }} /><span className="hidden text-[9px] text-slate-400 sm:block">{day.label}</span></div>)}</div><div className="mt-6 flex flex-wrap gap-2">{[...pageCounts.entries()].sort((a,b) => b[1]-a[1]).map(([page, count]) => <span key={page} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600"><b className="text-navy">{count}</b> {page.replaceAll("_", " ")}</span>)}</div></div></section>

    {recoveryRows.length > 0 && <section className="mt-8 overflow-hidden rounded-2xl border border-orange-200 bg-orange-50"><div className="border-b border-orange-200 px-6 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="dq-eyebrow text-orange-800">Workspace triage</p><h2 className="dq-h2">Customers that need attention</h2></div><p className="text-xs text-slate-600">Ordered by delivery failures, onboarding stalls, then inactivity.</p></div><form method="get" className="mt-5 grid gap-3 rounded-xl bg-white/70 p-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr_auto]"><FilterSelect name="severity" label="Severity" value={severityFilter} options={["all", "critical", "high", "medium", "monitor"]} /><FilterSelect name="supportStatus" label="Support status" value={statusFilter} options={["all", "open", "monitoring", "resolved"]} /><FilterSelect name="plan" label="Plan" value={planFilter} options={["all", "intelligence", "client_advisory"]} /><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Owner<input name="owner" defaultValue={typeof query.owner === "string" ? query.owner : ""} placeholder="Name or team" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-navy" /></label><button className="self-end rounded-md bg-navy px-4 py-2 text-xs font-semibold text-white">Apply</button></form></div><div className="divide-y divide-orange-200">{queueRows.map((row) => <article key={row.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[110px_1fr_1.2fr_170px] lg:items-center"><span className={`w-fit rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${row.recovery.level === "Critical" ? "bg-red-100 text-red-800" : row.recovery.level === "High" ? "bg-orange-200 text-orange-900" : "bg-white text-slate-600"}`}>{row.recovery.level}</span><div><p className="font-semibold text-navy">{row.brandProfile?.displayName ?? row.name}</p><p className="mt-1 text-xs text-slate-500">{row.progress} of 7 steps · {row.marketIqSupportState?.assignedTo ? `owned by ${row.marketIqSupportState.assignedTo}` : "unassigned"}</p></div><div><p className="text-sm font-semibold text-orange-950">{row.recovery.reason}</p><p className="mt-1 text-xs text-slate-600">{row.recovery.action}{row.marketIqSupportState?.followUpAt ? ` · follow up ${shortDate(row.marketIqSupportState.followUpAt)}` : ""}</p></div><Link href={`/market-iq/internal/admin/${row.id}`} className="rounded-md border border-orange-300 bg-white px-4 py-2 text-center text-xs font-semibold text-navy">Open support view</Link></article>)}{queueRows.length === 0 && <p className="px-6 py-8 text-sm text-slate-600">No workspaces match these filters.</p>}</div></section>}

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Customer workspaces</p><h2 className="dq-h2">Access, members, and usage</h2></div><div className="divide-y divide-slate-100">{rows.map((row) => <details key={row.id} className="group px-6 py-5"><summary className="grid cursor-pointer list-none gap-4 lg:grid-cols-[1.4fr_150px_110px_110px_130px] lg:items-center"><div><p className="font-semibold text-navy">{row.brandProfile?.displayName ?? row.name}</p><p className="mt-1 text-xs text-slate-500">{row.memberships.length} members · {row.marketIqSupportState?.assignedTo ? `owner ${row.marketIqSupportState.assignedTo}` : "unassigned"}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${row.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.subscription?.status ?? "not provisioned"}</span><p className="text-sm text-slate-600"><b className="text-navy">{row.views7}</b> views · 7d</p><p className="text-sm text-slate-600"><b className="text-navy">{row.users30}</b> users · 30d</p><p className="text-sm font-semibold capitalize text-navy lg:text-right">{row.marketIqSupportState?.status ?? `${row.progress} / 7 steps`}</p></summary><div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 xl:grid-cols-2"><div><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-navy">Invite a user</h3><p className="mt-1 text-xs text-slate-500">Clerk sends the invitation after an explicit click.</p></div><Link href={`/market-iq/internal/admin/${row.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy">Open support view</Link></div><InviteUserForm clerkOrgId={row.clerkOrgId} />{row.memberships.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{row.memberships.map((member) => <span key={member.userId} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">{userNames.get(member.userId) ?? member.userId} · {member.role.replace("org:", "")}</span>)}</div>}</div><div><h3 className="text-sm font-semibold text-navy">Commercial access</h3><p className="mt-1 mb-3 text-xs text-slate-500">Use enterprise provisioning for contracted customers. Stripe subscriptions continue to be managed in Stripe.</p><MarketIqCommercialAccessForm orgId={row.id} markets={commercialMarkets} subscriptions={row.marketIqSubscriptions.map((subscription) => ({ id: subscription.id, source: subscription.source, status: subscription.status, planKey: subscription.planKey, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, markets: subscription.markets }))} /></div></div></details>)}</div></section>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Measurement boundary</p><p className="mt-2 text-sm leading-6 text-slate-600">Traffic counts authenticated Market IQ route families only. It excludes public client-report visits, query strings, recipient identities, report content, and market selections. User names shown here are resolved from Clerk at read time.</p></section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-navy">{value}</p></article>;
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}<select name={name} defaultValue={value} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-normal capitalize normal-case tracking-normal text-navy">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}
