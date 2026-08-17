import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarketIqCheckoutFinalization } from "@/components/market-iq/billing/MarketIqCheckoutFinalization";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import {
  isActiveMarketIqSubscriptionStatus,
  MARKET_IQ_CLIENT_ADVISORY_PLAN,
  MARKET_IQ_INTELLIGENCE_PLAN,
  MARKET_IQ_PLANS,
  isMarketIqBillingInterval,
  marketIqFoundingPriceCents,
  marketIqPlanForKey,
  marketIqPlanPriceLabel,
} from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { stripeConfigured } from "@/lib/stripe.server";

export const dynamic = "force-dynamic";

const FEATURES = {
  intelligence: [
    "Interactive rental-market intelligence",
    "MSA, city, and ZIP rent trajectories",
    "Apartment and house segment analysis",
    "Current listing and market-change context",
  ],
  client_advisory: [
    "Everything in Market IQ Intelligence",
    "PM-branded interactive client reports",
    "Client and prospect recipient directory",
    "Reviewed SendGrid delivery and history",
    "Recurring edition drafts and PDF export",
  ],
} as const;

function configuredPriceId(planKey: string, billingInterval: "month" | "year") {
  if (planKey === MARKET_IQ_INTELLIGENCE_PLAN.key) {
    return billingInterval === "year"
      ? process.env.STRIPE_MARKET_IQ_INTELLIGENCE_FOUNDING_ANNUAL_PRICE_ID
      : process.env.STRIPE_MARKET_IQ_INTELLIGENCE_FOUNDING_PRICE_ID
        || process.env.STRIPE_MARKET_IQ_INTELLIGENCE_PRICE_ID;
  }
  if (planKey === MARKET_IQ_CLIENT_ADVISORY_PLAN.key) {
    return billingInterval === "year"
      ? process.env.STRIPE_MARKET_IQ_CLIENT_ADVISORY_FOUNDING_ANNUAL_PRICE_ID
      : process.env.STRIPE_MARKET_IQ_CLIENT_ADVISORY_FOUNDING_PRICE_ID
        || process.env.STRIPE_MARKET_IQ_CLIENT_ADVISORY_PRICE_ID;
  }
  return null;
}

export default async function MarketIqSubscribePage({
  searchParams,
}: {
    searchParams: Promise<{ checkout?: string; state?: string; upgrade?: string; billing?: string; next?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId, organizationId, role } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const query = await searchParams;
  const requestedBillingInterval = query.billing ?? "";
  const billingInterval = isMarketIqBillingInterval(requestedBillingInterval) ? requestedBillingInterval : "month";
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      marketIqWorkspacePreference: { select: { onboardingCompletedAt: true } },
      marketIqSubscriptions: {
        include: { markets: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!organization) redirect("/setup-workspace");
  const active = organization.marketIqSubscriptions.find((subscription) => isActiveMarketIqSubscriptionStatus(subscription.status));
  const activePlan = marketIqPlanForKey(active?.planKey);
  const latest = organization.marketIqSubscriptions[0] ?? null;
  const canManageBilling = role === "org:admin";
  const activationComplete = Boolean(organization.marketIqWorkspacePreference?.onboardingCompletedAt);
  const checkoutNextUrl = activationComplete
    ? "/market-iq"
    : activePlan?.tier === "intelligence"
      ? "/market-iq/get-started?step=2&purchase=success"
      : "/market-iq/get-started?step=1&purchase=success";

  return <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 sm:px-6 lg:py-16">
    <div className="mx-auto max-w-6xl">
      <header className="max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Market IQ plans</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-navy sm:text-5xl">Start with market intelligence. Add a client advisory channel when you are ready.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">Both plans include one market and the same underlying Dwellsy intelligence. Client Advisory adds the controlled, PM-branded workflow for sharing that intelligence with clients and prospects.</p>
        <nav aria-label="Billing frequency" className="mt-7 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <Link href="/market-iq/subscribe?billing=month" className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${billingInterval === "month" ? "bg-navy text-white" : "text-slate-600"}`}>Monthly</Link>
          <Link href="/market-iq/subscribe?billing=year" className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${billingInterval === "year" ? "bg-navy text-white" : "text-slate-600"}`}>Annual</Link>
        </nav>
      </header>

      {query.checkout === "success" && <MarketIqCheckoutFinalization initialReady={Boolean(active)} initialPlanName={activePlan?.name ?? null} initialNextUrl={checkoutNextUrl} />}
      {query.checkout === "canceled" && <p className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">Checkout was canceled. Nothing was charged.</p>}
      {query.upgrade === "client_advisory" && activePlan?.tier === "intelligence" && <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">Client publishing and distribution are part of Client Advisory. Upgrade to unlock these capabilities.</p>}

      {active && <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-800">Current plan</p><p className="mt-1 font-semibold text-navy">{activePlan?.name ?? "Market IQ Client Advisory"} · billed {active.billingInterval === "year" ? "annually" : "monthly"} · {active.markets.length} market{active.markets.length === 1 ? "" : "s"}</p></div>
        <Link href={activationComplete ? "/market-iq" : "/market-iq/get-started"} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">{activationComplete ? "Open Market IQ" : query.checkout === "success" || query.next === "activation" ? "Activate your workspace" : "Finish setup"}</Link>
      </section>}

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        {MARKET_IQ_PLANS.map((plan) => {
          const isAdvisory = plan.tier === "client_advisory";
          const isCurrent = activePlan?.tier === plan.tier;
          const isUpgrade = activePlan?.tier === "intelligence" && isAdvisory;
          const checkoutReady = stripeConfigured() && Boolean(configuredPriceId(plan.key, billingInterval));
          const displayedPrice = marketIqFoundingPriceCents(plan, billingInterval);
          return <article key={plan.key} className={`relative rounded-2xl border bg-white p-7 shadow-sm sm:p-9 ${isAdvisory ? "border-navy" : "border-slate-200"}`}>
            {isAdvisory && <p className="absolute right-6 top-0 -translate-y-1/2 rounded-full bg-navy px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Client growth plan</p>}
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">One market</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">{plan.name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
            <div className="mt-6 flex items-end gap-3">
              <span className="text-5xl font-bold text-navy">{marketIqPlanPriceLabel(displayedPrice)}</span>
              <span className="pb-1 text-sm text-slate-500">per {billingInterval}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{billingInterval === "year" ? `Founding annual price · save ${marketIqPlanPriceLabel(plan.foundingMonthlyPriceCents * 12 - plan.foundingAnnualPriceCents)}` : <><span className="line-through">{marketIqPlanPriceLabel(plan.monthlyPriceCents)}</span> standard price · founding offer</>}</p>
            <ul className="mt-7 space-y-3 text-sm leading-6 text-slate-700">
              {FEATURES[plan.tier].map((feature) => <li key={feature} className="flex gap-3"><span aria-hidden="true" className="font-bold text-teal-700">✓</span><span>{feature}</span></li>)}
            </ul>
            <div className="mt-8">
              {isCurrent ? <p className="rounded-md bg-emerald-50 px-5 py-3.5 text-center text-sm font-semibold text-emerald-800">Your current plan</p>
                : active && !isUpgrade ? null
                : canManageBilling && checkoutReady && !active ? <form action="/api/market-iq/billing/checkout" method="post"><input type="hidden" name="planKey" value={plan.key} /><input type="hidden" name="billingInterval" value={billingInterval} /><button className="w-full rounded-md bg-navy px-5 py-3.5 text-sm font-semibold text-white hover:bg-navy/90">Choose the {marketIqPlanPriceLabel(displayedPrice)} {billingInterval === "year" ? "annual" : "monthly"} plan</button></form>
                : isUpgrade && active?.source === "stripe" && active.stripeCustomerId ? <form action="/api/market-iq/billing/portal" method="post"><button className="w-full rounded-md bg-navy px-5 py-3.5 text-sm font-semibold text-white">Upgrade to Client Advisory</button></form>
                : isUpgrade ? <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-slate-700">Your founding Intelligence plan was provisioned directly. Contact Dwellsy to move this workspace to the $149 Client Advisory founding plan.</div>
                : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{!canManageBilling ? "Ask an organization administrator to select this plan." : "Online checkout is being configured. Early customers can be provisioned directly at the founding price."}</div>}
            </div>
          </article>;
        })}
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">The product boundary</p><p className="mt-3 text-sm leading-6 text-white/85">Intelligence is for your team. Client Advisory is for putting your firm’s point of view in front of clients and prospects. The upgrade buys a distribution workflow, not different market data.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600"><p className="font-semibold text-navy">Enterprise purchase?</p><p className="mt-2">Early clients can be provisioned directly under a signed agreement at either founding tier. Stripe checkout can be enabled later without changing the entitlement model.</p>{latest?.source === "stripe" && latest.stripeCustomerId && canManageBilling && <form className="mt-4" action="/api/market-iq/billing/portal" method="post"><button className="font-semibold text-teal-700">Manage billing in Stripe →</button></form>}</article>
      </section>
    </div>
  </main>;
}
