import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPlanForKey } from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadClevelandLiveListingPulse } from "@/lib/market-iq/live-listings.server";
import { loadClevelandMarketReadTrendPulses } from "@/lib/market-iq/trends.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "Awaiting source";
}

function monthLabel(value: string | Date | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    : "Awaiting source";
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default async function MarketIqHomePage() {
  if (!marketIqPreviewEnabled()) notFound();
  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const context = await getActiveOrgContext();
  if (!context.organizationId) redirect("/setup-workspace");

  const [trendPulses, liveListings, workspace] = await Promise.all([
    loadClevelandMarketReadTrendPulses(),
    loadClevelandLiveListingPulse(),
    prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: {
        name: true,
        marketIqWorkspacePreference: true,
        _count: { select: { marketIqReportRecipients: true, marketIqReports: true } },
        marketIqEditionDrafts: {
          where: { status: { in: ["ready", "reviewing"] } },
          orderBy: { detectedAt: "desc" },
          take: 1,
          select: { id: true, periodEnd: true, materialChangeCount: true, status: true },
        },
        marketIqReportSends: {
          where: { deliveryStatus: { in: ["sent", "delivered"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { sentAt: true, deliveredAt: true },
        },
      },
    }),
  ]);
  if (!workspace) redirect("/setup-workspace");

  const msa = trendPulses.find((pulse) => pulse.trendSource.geographyType === "msa") ?? trendPulses[0] ?? null;
  const apartment = msa?.segments.find((segment) => segment.label === "1-bed apartment") ?? null;
  const house = msa?.segments.find((segment) => segment.label === "3-bed house") ?? null;
  const onboardingComplete = Boolean(workspace.marketIqWorkspacePreference?.onboardingCompletedAt);
  const draft = workspace.marketIqEditionDrafts[0] ?? null;
  const plan = marketIqPlanForKey(access.planKey);
  const advisory = access.capabilities.publishClientReports;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_390px] lg:items-end lg:p-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Cleveland market workspace</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight text-navy sm:text-5xl">Know what changed before the next owner conversation.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Market IQ turns Dwellsy’s asking-rent trajectories and current listing activity into one practical local read for your team.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/market-iq/market" className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">Open market intelligence</Link>
              {advisory ? <Link href={draft ? "/market-iq/review" : "/market-iq/editions"} className="rounded-md border border-navy bg-white px-5 py-3 text-sm font-semibold text-navy">{draft ? "Review the next edition" : "Prepare a client edition"}</Link> : <Link href="/market-iq/subscribe?upgrade=client_advisory" className="rounded-md border border-navy bg-white px-5 py-3 text-sm font-semibold text-navy">Add client sharing</Link>}
            </div>
          </div>
          <aside className="rounded-2xl bg-navy p-6 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Current market read</p>
            <p className="mt-3 text-2xl font-semibold leading-8">{msa?.signal.heading ?? "Cleveland source refresh pending"}</p>
            <p className="mt-3 text-sm leading-6 text-white/70">{msa?.signal.narrative ?? "The next dated Cleveland read will appear when the monthly Trends data is available."}</p>
            <p className="mt-4 text-xs text-white/45">Trends IQ through {monthLabel(msa?.trendSource.availableThrough ?? null)}</p>
          </aside>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          <article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1-bed apartments</p><p className="mt-2 text-2xl font-semibold text-navy">{apartment ? `$${apartment.rent.toLocaleString("en-US")}` : "Pending"}</p><p className="mt-1 text-sm text-slate-500">{apartment ? `${percent(apartment.yoy)} year over year` : "No current read"}</p></article>
          <article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3-bed houses</p><p className="mt-2 text-2xl font-semibold text-navy">{house ? `$${house.rent.toLocaleString("en-US")}` : "Pending"}</p><p className="mt-1 text-sm text-slate-500">{house ? `${percent(house.yoy)} year over year` : "No current read"}</p></article>
          <article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active listings</p><p className="mt-2 text-2xl font-semibold text-navy">{liveListings.status === "healthy" ? liveListings.activeListings.toLocaleString("en-US") : "Pending"}</p><p className="mt-1 text-sm text-slate-500">{liveListings.status === "healthy" ? `Observed ${dateLabel(liveListings.sourceAvailableThrough)}` : "Awaiting synchronized snapshot"}</p></article>
          <article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your plan</p><p className="mt-2 text-2xl font-semibold text-navy">{plan?.tier === "client_advisory" || access.source !== "subscription" ? "Client Advisory" : "Intelligence"}</p><Link href="/market-iq/account" className="mt-1 inline-block text-sm font-semibold text-teal-700">Account and billing →</Link></article>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">What deserves attention</p><h2 className="mt-2 text-2xl font-semibold text-navy">Start here</h2></div>
            <Link href="/market-iq/market#local-areas" className="text-sm font-semibold text-teal-700">Explore local areas →</Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link href="/market-iq/market" className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:border-teal-300"><p className="text-sm font-semibold text-navy">Read the market</p><p className="mt-2 text-sm leading-6 text-slate-600">Compare MSA, city, ZIP, apartment, and house trajectories in the current Cleveland view.</p></Link>
            {advisory ? <Link href={draft ? "/market-iq/review" : "/market-iq/editions"} className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:border-teal-300"><p className="text-sm font-semibold text-navy">{draft ? `${draft.materialChangeCount} changes need review` : "Prepare the next edition"}</p><p className="mt-2 text-sm leading-6 text-slate-600">{draft ? `A private ${dateLabel(draft.periodEnd)} draft is waiting for your review.` : "Add your firm’s commentary, review the data, and create a client-ready link."}</p></Link> : <Link href="/market-iq/subscribe?upgrade=client_advisory" className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:border-teal-300"><p className="text-sm font-semibold text-navy">Prepare reports for clients</p><p className="mt-2 text-sm leading-6 text-slate-600">Client Advisory adds your firm’s branding, recipient management, and email delivery.</p></Link>}
          </div>
        </div>

        <aside className="space-y-5">
          <section className={`rounded-2xl border p-6 ${onboardingComplete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Workspace readiness</p><p className="mt-2 text-xl font-semibold text-navy">{onboardingComplete ? "Your market scope is active" : "Finish your market setup"}</p><p className="mt-2 text-sm leading-6 text-slate-600">{onboardingComplete ? "Your saved geography and segment choices will carry into future analysis." : "Choose the cities, ZIPs, and segments your team wants to follow."}</p><Link href="/market-iq/get-started" className="mt-4 inline-block text-sm font-semibold text-teal-800">{onboardingComplete ? "Edit workspace setup" : "Continue setup"} →</Link></section>
          {advisory && <section className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Client channel</p><p className="mt-2 text-xl font-semibold text-navy">{workspace._count.marketIqReportRecipients} saved recipients</p><p className="mt-2 text-sm leading-6 text-slate-600">{workspace._count.marketIqReports} editions created. {workspace.marketIqReportSends[0] ? `Latest delivery activity ${dateLabel(workspace.marketIqReportSends[0].deliveredAt ?? workspace.marketIqReportSends[0].sentAt)}.` : "No report has been sent yet."}</p><Link href="/market-iq/distribution" className="mt-4 inline-block text-sm font-semibold text-teal-800">Open clients and distribution →</Link></section>}
        </aside>
      </section>
    </main>
  );
}
