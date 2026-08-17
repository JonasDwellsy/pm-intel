import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { isActiveMarketIqSubscriptionStatus, marketIqFoundingPriceCents, marketIqPlanForKey, marketIqPlanPriceLabel } from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not scheduled";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export default async function MarketIqAccountPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId, role }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct) redirect("/market-iq/subscribe");

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      brandProfile: { select: { displayName: true } },
      marketIqWorkspacePreference: true,
      marketIqSubscriptions: { orderBy: { createdAt: "desc" }, take: 8, include: { markets: true } },
      _count: { select: { marketIqReportRecipients: true, marketIqReports: true } },
    },
  });
  if (!organization) redirect("/setup-workspace");

  const subscription = organization.marketIqSubscriptions.find((item) => isActiveMarketIqSubscriptionStatus(item.status)) ?? organization.marketIqSubscriptions[0] ?? null;
  const plan = marketIqPlanForKey(access.planKey ?? subscription?.planKey);
  const advisory = access.capabilities.publishClientReports;
  const setupComplete = Boolean(organization.marketIqWorkspacePreference?.onboardingCompletedAt);
  const canManageBilling = role === "org:admin";
  const stripeManaged = subscription?.source === "stripe" && Boolean(subscription.stripeCustomerId);
  const price = plan && subscription ? marketIqPlanPriceLabel(marketIqFoundingPriceCents(plan, subscription.billingInterval === "year" ? "year" : "month")) : null;
  const scope = organization.marketIqWorkspacePreference;
  const selection = marketIqSelectionFromPreference(scope);

  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
    <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_330px] lg:items-end">
      <div><p className="dq-eyebrow">Account and workspace</p><h1 className="dq-h1">Market IQ settings</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Review your plan, billing status, Cleveland access, and workspace setup.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">Signed-in workspace</p><p className="mt-2 text-xl font-semibold">{organization.name}</p><p className="mt-2 text-sm text-white/65">{role === "org:admin" ? "Organization administrator" : "Organization member"}</p></aside>
    </header>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_280px] lg:items-start">
        <div><div className="flex flex-wrap items-center gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700">Current plan</p>{subscription && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isActiveMarketIqSubscriptionStatus(subscription.status) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{statusLabel(subscription.status)}</span>}</div><h2 className="mt-2 text-3xl font-semibold text-navy">{plan?.name ?? (advisory ? "Market IQ Client Advisory" : "Market IQ Intelligence")}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{advisory ? "Market intelligence plus PM-branded editions, recipient management, reviewed delivery, and recurring edition preparation." : "Internal Cleveland rental-market intelligence for your property management team."}</p><div className="mt-6 flex flex-wrap gap-3">{stripeManaged && canManageBilling ? <form action="/api/market-iq/billing/portal" method="post"><button className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">Manage billing in Stripe</button></form> : <Link href="/market-iq/subscribe" className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">Review plans</Link>}{!advisory && <Link href="/market-iq/subscribe?upgrade=client_advisory" className="rounded-md border border-navy px-5 py-3 text-sm font-semibold text-navy">Add Client Advisory</Link>}</div></div>
        <dl className="rounded-xl bg-slate-50 p-5 text-sm"><div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><dt className="text-slate-500">Price</dt><dd className="font-semibold text-navy">{price ? `${price}/${subscription?.billingInterval === "year" ? "year" : "month"}` : "Direct agreement"}</dd></div><div className="flex justify-between gap-4 border-b border-slate-200 py-3"><dt className="text-slate-500">Markets</dt><dd className="font-semibold text-navy">{subscription?.markets.length ?? 1}</dd></div><div className="flex justify-between gap-4 border-b border-slate-200 py-3"><dt className="text-slate-500">Access through</dt><dd className="text-right font-semibold text-navy">{dateLabel(subscription?.currentPeriodEnd)}</dd></div><div className="flex justify-between gap-4 pt-3"><dt className="text-slate-500">Renewal</dt><dd className="text-right font-semibold text-navy">{subscription?.cancelAtPeriodEnd ? "Ends this period" : stripeManaged ? "Automatic" : "Per agreement"}</dd></div></dl>
      </div>
      {subscription?.status === "past_due" && <div className="border-t border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-950 sm:px-8"><strong>Payment needs attention.</strong> Market access remains available during the grace period. An organization administrator can update the payment method in Stripe.</div>}
      {subscription?.cancelAtPeriodEnd && <div className="border-t border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-950 sm:px-8"><strong>Cancellation is scheduled.</strong> Access continues through {dateLabel(subscription.currentPeriodEnd)}.</div>}
    </section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Market workspace</p><h2 className="mt-2 text-2xl font-semibold text-navy">{setupComplete ? "Cleveland scope is active" : "Setup is incomplete"}</h2></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${setupComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{setupComplete ? "Ready" : "Action needed"}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{scope ? `${selection.cities.length} cities, ${selection.zipCodes.length} ZIPs, and ${selection.segments.length} rental segments are saved as your default view.` : "Choose the Cleveland geographies and rental segments your team wants to follow."}</p><Link href="/market-iq/get-started" className="mt-5 inline-flex text-sm font-semibold text-teal-700">{setupComplete ? "Edit market setup" : "Complete market setup"} →</Link></article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Client channel</p><h2 className="mt-2 text-2xl font-semibold text-navy">{advisory ? "Client Advisory is enabled" : "Available as an upgrade"}</h2></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${advisory ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{advisory ? "Included" : "$149 founding"}</span></div>{advisory ? <><p className="mt-3 text-sm leading-6 text-slate-600">{organization.brandProfile ? `${organization.brandProfile.displayName} is the client-facing report brand.` : "Add your firm identity before publishing a client-facing edition."}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{organization._count.marketIqReports}</p><p className="mt-1 text-xs text-slate-500">created editions</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{organization._count.marketIqReportRecipients}</p><p className="mt-1 text-xs text-slate-500">saved recipients</p></div></div><Link href="/market-iq/launch" className="mt-5 inline-flex text-sm font-semibold text-teal-700">Open advisory launch →</Link></> : <><p className="mt-3 text-sm leading-6 text-slate-600">Add PM-branded client reports, a recipient directory, recurring drafts, and individually confirmed SendGrid delivery.</p><Link href="/market-iq/subscribe?upgrade=client_advisory" className="mt-5 inline-flex text-sm font-semibold text-teal-700">Compare the upgrade →</Link></>}</article>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-600"><p className="font-semibold text-navy">Access is organization-based</p><p className="mt-1">Plan, market, branding, and client-distribution settings belong to {organization.name}. Only an organization administrator can change billing. Members can use the features included in the organization’s active plan.</p></section>
  </main>;
}
