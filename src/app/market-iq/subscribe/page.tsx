import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { marketIqPlanPriceLabel, isActiveMarketIqSubscriptionStatus } from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { stripeConfigured } from "@/lib/stripe.server";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  return value?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) ?? null;
}

export default async function MarketIqSubscribePage({ searchParams }: { searchParams: Promise<{ checkout?: string; state?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId, organizationId, role } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const query = await searchParams;
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
  const latest = organization.marketIqSubscriptions[0] ?? null;
  const canManageBilling = role === "org:admin";
  const checkoutReady = stripeConfigured() && Boolean(process.env.STRIPE_MARKET_IQ_SINGLE_MARKET_PRICE_ID);
  const activationComplete = Boolean(organization.marketIqWorkspacePreference?.onboardingCompletedAt);

  return <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 sm:px-6 lg:py-16">
    <div className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Market IQ</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-navy sm:text-5xl">A local market read your firm can put in front of clients.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">Choose a market, add your branding, and publish an interactive rental-market advisory. No portfolio upload or implementation project is required.</p>
      </header>

      {query.checkout === "success" && !active && <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">Payment was accepted. Stripe is finalizing access now. Refresh this page in a few seconds.</p>}
      {query.checkout === "canceled" && <p className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">Checkout was canceled. Nothing was charged.</p>}

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">One-market plan</p><h2 className="mt-2 text-2xl font-bold text-navy">Cleveland–Elyria, OH</h2></div>
            <p className="text-right"><span className="text-4xl font-bold text-navy">{marketIqPlanPriceLabel()}</span><span className="block text-sm text-slate-500">per month</span></p>
          </div>
          <ul className="mt-7 grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
            <li>Interactive PM-branded market read</li><li>City and ZIP-level rent trajectories</li><li>Client and prospect sharing links</li><li>PM-branded SendGrid delivery</li><li>PDF export</li><li>Successive edition comparisons</li>
          </ul>

          {active ? <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-800">{active.source === "enterprise" ? "Enterprise provisioned" : active.status === "past_due" ? "Payment needs attention" : "Subscription active"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{organization.name} has access to {active.markets.length} market{active.markets.length === 1 ? "" : "s"}.{active.cancelAtPeriodEnd && active.currentPeriodEnd ? ` Access remains available through ${dateLabel(active.currentPeriodEnd)}.` : ""}</p>
            <div className="mt-4 flex flex-wrap gap-3"><Link href={activationComplete ? "/market-iq/report" : "/market-iq/get-started"} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">{activationComplete ? "Create a client read" : "Finish setup"}</Link><Link href="/market-iq" className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy">Open Market IQ</Link></div>
          </div> : <div className="mt-8">
            {canManageBilling && checkoutReady ? <form action="/api/market-iq/billing/checkout" method="post"><button className="w-full rounded-md bg-navy px-5 py-3.5 text-sm font-semibold text-white hover:bg-navy/90">Subscribe with Stripe</button></form> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">{!canManageBilling ? "Ask an organization administrator to start the subscription." : "Online checkout is being configured. Enterprise-provisioned access remains available for early customers."}</div>}
          </div>}
        </article>

        <aside className="space-y-5">
          <section className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Low-touch setup</p><ol className="mt-4 space-y-4 text-sm leading-6"><li><span className="font-bold">1.</span> Subscribe for the market.</li><li><span className="font-bold">2.</span> Add your logo and firm colors.</li><li><span className="font-bold">3.</span> Review and publish the first advisory.</li></ol></section>
          {latest?.source === "stripe" && latest.stripeCustomerId && canManageBilling && <form action="/api/market-iq/billing/portal" method="post"><button className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-navy">Manage billing in Stripe</button></form>}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600"><p className="font-semibold text-navy">Enterprise purchase?</p><p className="mt-2">Early clients can be provisioned directly under a signed agreement. The product experience is identical after access is granted.</p></section>
        </aside>
      </section>
    </div>
  </main>;
}
