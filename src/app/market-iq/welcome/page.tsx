import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MARKET_IQ_CLIENT_ADVISORY_PLAN,
  MARKET_IQ_INTELLIGENCE_PLAN,
  marketIqPlanPriceLabel,
} from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const metadata: Metadata = {
  title: { absolute: "Market IQ | Local rental intelligence for property managers" },
  description:
    "Understand local rent direction, explain what changed, and share a property-manager-branded market read with clients and prospects.",
};

const SIGN_IN_TO_PLANS = "/sign-in?redirect_url=%2Fmarket-iq%2Fsubscribe%3Fbilling%3Dmonth";
const SAMPLE_REPORT = "/reports/market/preview-cleveland-market-read";

const WORKFLOW = [
  {
    number: "01",
    title: "Read the market",
    body: "See MSA, city, and ZIP rent trajectories by apartment and house segment, with clear source dates and geographic context.",
  },
  {
    number: "02",
    title: "Find the useful story",
    body: "Move from a wall of numbers to the local changes that deserve attention before your next owner or prospect conversation.",
  },
  {
    number: "03",
    title: "Share your point of view",
    body: "Review a PM-branded edition, add your own commentary and firm information, then send it only to recipients you approve.",
  },
] as const;

const INTELLIGENCE_FEATURES = [
  "Interactive MSA, city, and ZIP analysis",
  "Apartment and house segment trajectories",
  "Current listing and market-change context",
  "One local market workspace",
] as const;

const ADVISORY_FEATURES = [
  "Everything in Market IQ Intelligence",
  "PM-branded interactive client editions",
  "Optional PM commentary and firm profile",
  "Recipient review, controlled delivery, and history",
  "Recurring edition drafts for PM approval",
] as const;

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-slate-700">
      <span aria-hidden className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">✓</span>
      <span>{children}</span>
    </li>
  );
}

export default function MarketIqWelcomePage() {
  if (!marketIqPreviewEnabled()) notFound();

  return (
    <main className="overflow-hidden bg-[#f7f7f4]">
      <section className="relative border-b border-slate-200 bg-[#f7f7f4]">
        <div aria-hidden className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_72%_18%,rgba(31,124,139,0.16),transparent_42%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-7 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700">Rental-market intelligence for property managers</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-bold leading-[1.02] tracking-[-0.045em] text-navy sm:text-6xl">See where local rents are moving, then explain why it matters.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Market IQ tracks changes across the local asking market. Client Advisory lets property managers add their own commentary and share a firm-branded report with owners and prospects.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={SIGN_IN_TO_PLANS} className="rounded-md bg-navy px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-navy/90">Sign in and choose a plan</Link>
              <Link href={SAMPLE_REPORT} className="rounded-md border border-navy bg-white px-6 py-3.5 text-sm font-semibold text-navy transition hover:bg-slate-50">View a Cleveland example</Link>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">Founding plans start at $49 per month for one market. Every client edition requires PM review before delivery.</p>
          </div>

          <div className="relative">
            <div aria-hidden className="absolute -inset-6 rounded-[40px] bg-teal-100/50 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,37,68,0.14)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Cleveland market read</p><p className="mt-1 text-sm font-semibold text-navy">What changed this month</p></div>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">Current</span>
              </div>
              <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
                <div className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">1-bed apartments</p><p className="mt-3 text-3xl font-semibold text-navy">MSA to ZIP</p><p className="mt-2 text-sm leading-6 text-slate-500">Compare the same product across each geographic level.</p></div>
                <div className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">3-bed houses</p><p className="mt-3 text-3xl font-semibold text-navy">Local direction</p><p className="mt-2 text-sm leading-6 text-slate-500">Separate house movement from apartment movement.</p></div>
              </div>
              <div className="p-6 sm:p-7">
                <div className="rounded-2xl bg-navy p-6 text-white">
                  <div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Cleveland rent trends</p><p className="mt-2 text-xl font-semibold">One market, several different local patterns</p></div><span className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/70">Jul 2026</span></div>
                  <div className="mt-6 grid grid-cols-5 items-end gap-2" aria-label="Illustrative local trend distribution">
                    {[42, 66, 53, 82, 61].map((height, index) => <div key={height} className="flex flex-col items-center gap-2"><div className={`w-full rounded-t-sm ${index === 3 ? "bg-teal-300" : index === 0 ? "bg-orange-300" : "bg-white/30"}`} style={{ height }} /><span className="text-[9px] text-white/45">ZIP {index + 1}</span></div>)}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4"><div><p className="text-xs font-semibold text-navy">Ready for your client commentary</p><p className="mt-1 text-xs text-slate-500">Your brand, your message, Dwellsy market data.</p></div><span className="rounded-md bg-orange-100 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800">PM review</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
          <div className="lg:sticky lg:top-28"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Two plans</p><h2 className="mt-3 text-4xl font-bold tracking-tight text-navy">Use the data internally or share a branded report.</h2><p className="mt-5 text-base leading-7 text-slate-600">Market IQ Intelligence gives your team the full local market view. Client Advisory adds firm branding, commentary, recipient management, and email delivery.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">For your team</p><h3 className="mt-3 text-2xl font-semibold text-navy">Market IQ Intelligence</h3><p className="mt-3 text-sm leading-6 text-slate-600">Walk into pricing, owner, and prospect conversations with a current local read instead of a spreadsheet dump.</p><div className="mt-7 border-t border-slate-100 pt-5 text-sm font-semibold text-teal-800">Internal market workspace</div></article>
            <article className="rounded-2xl border border-navy bg-navy p-7 text-white shadow-lg"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">For your clients and prospects</p><h3 className="mt-3 text-2xl font-semibold">Market IQ Client Advisory</h3><p className="mt-3 text-sm leading-6 text-white/72">Add your firm’s interpretation and branding to a recurring local market report.</p><div className="mt-7 border-t border-white/10 pt-5 text-sm font-semibold text-teal-200">Reviewed PM-branded editions</div></article>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="max-w-3xl"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">A practical monthly rhythm</p><h2 className="mt-3 text-4xl font-bold tracking-tight text-navy">From market change to client conversation.</h2></div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {WORKFLOW.map((step) => <article key={step.number} className="rounded-2xl border border-slate-200 bg-[#fbfbf9] p-7"><p className="font-mono text-xs font-semibold text-teal-700">{step.number}</p><h3 className="mt-5 text-xl font-semibold text-navy">{step.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p></article>)}
          </div>
          <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-8"><div><p className="text-sm font-semibold text-navy">The PM remains in control.</p><p className="mt-1 text-sm leading-6 text-slate-600">Market IQ prepares the evidence. Nothing is sent until the PM reviews the edition and confirms each recipient.</p></div><Link href={SAMPLE_REPORT} className="mt-4 inline-flex shrink-0 text-sm font-semibold text-teal-900 sm:mt-0">See the client experience →</Link></div>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-3xl text-center"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Founding pricing</p><h2 className="mt-3 text-4xl font-bold tracking-tight text-navy">Start with the job you need done.</h2><p className="mt-4 text-base leading-7 text-slate-600">Both plans include one market and the same underlying rental-market intelligence. Upgrade when you are ready to add a client-facing advisory channel.</p></div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Market IQ Intelligence</p><div className="mt-5 flex items-end gap-3"><span className="text-5xl font-bold text-navy">{marketIqPlanPriceLabel(MARKET_IQ_INTELLIGENCE_PLAN.foundingMonthlyPriceCents)}</span><span className="pb-1 text-sm text-slate-500">per month</span></div><p className="mt-2 text-sm text-slate-500"><span className="line-through">{marketIqPlanPriceLabel(MARKET_IQ_INTELLIGENCE_PLAN.monthlyPriceCents)}</span> standard price · {marketIqPlanPriceLabel(MARKET_IQ_INTELLIGENCE_PLAN.foundingAnnualPriceCents)} annually</p>
            <ul className="mt-7 space-y-3">{INTELLIGENCE_FEATURES.map((feature) => <CheckItem key={feature}>{feature}</CheckItem>)}</ul>
            <Link href={SIGN_IN_TO_PLANS} className="mt-8 flex w-full justify-center rounded-md border border-navy px-5 py-3.5 text-sm font-semibold text-navy transition hover:bg-slate-50">Choose Intelligence</Link>
          </article>
          <article className="relative rounded-3xl border border-navy bg-white p-8 shadow-[0_20px_50px_rgba(15,37,68,0.12)] sm:p-10"><p className="absolute right-7 top-0 -translate-y-1/2 rounded-full bg-navy px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Client growth plan</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Market IQ Client Advisory</p><div className="mt-5 flex items-end gap-3"><span className="text-5xl font-bold text-navy">{marketIqPlanPriceLabel(MARKET_IQ_CLIENT_ADVISORY_PLAN.foundingMonthlyPriceCents)}</span><span className="pb-1 text-sm text-slate-500">per month</span></div><p className="mt-2 text-sm text-slate-500"><span className="line-through">{marketIqPlanPriceLabel(MARKET_IQ_CLIENT_ADVISORY_PLAN.monthlyPriceCents)}</span> standard price · {marketIqPlanPriceLabel(MARKET_IQ_CLIENT_ADVISORY_PLAN.foundingAnnualPriceCents)} annually</p>
            <ul className="mt-7 space-y-3">{ADVISORY_FEATURES.map((feature) => <CheckItem key={feature}>{feature}</CheckItem>)}</ul>
            <Link href={SIGN_IN_TO_PLANS} className="mt-8 flex w-full justify-center rounded-md bg-navy px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-navy/90">Choose Client Advisory</Link>
          </article>
        </div>
      </section>

      <section className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-14 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-16"><div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-teal-200">Market IQ by Dwellsy IQ</p><h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">Make local market intelligence part of how clients experience your firm.</h2></div><div className="flex shrink-0 flex-wrap gap-3"><Link href={SIGN_IN_TO_PLANS} className="rounded-md bg-white px-6 py-3.5 text-sm font-semibold text-navy">Sign in to get started</Link><Link href={SAMPLE_REPORT} className="rounded-md border border-white/25 px-6 py-3.5 text-sm font-semibold text-white">View the example</Link></div></div>
      </section>
    </main>
  );
}
