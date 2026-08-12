import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { PrintOwnerBriefingButton } from "@/components/portfolio-iq/PrintOwnerBriefingButton";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadPilotValueReview, loadStoredPilotValueReview } from "@/lib/portfolio-iq/pilot-value-review.server";
import type { PilotValueReviewSnapshot } from "@/lib/portfolio-iq/pilot-value-review";
import { lockPilotValueReview } from "./actions";

export const dynamic = "force-dynamic";

function dateLabel(value: string | Date | null): string {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not yet";
}
function money(value: number): string { return `$${Math.round(value).toLocaleString("en-US")}`; }
function percent(value: number | null): string { return value === null ? "Not established" : `${Math.round(value * 100)}%`; }

export default async function PilotValueReviewPage({ searchParams }: { searchParams: Promise<{ review?: string; locked?: string }> }) {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const [{ userId, organizationId }, entitlement, query] = await Promise.all([getActiveOrgContext(), resolveViewerEntitlement(), searchParams]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const [live, stored] = await Promise.all([
    loadPilotValueReview({ userId, organizationId }),
    query.review ? loadStoredPilotValueReview({ organizationId, reviewId: query.review }) : null,
  ]);
  if (!live) notFound();
  const snapshot: PilotValueReviewSnapshot = stored?.snapshot ?? live.snapshot;
  if (!isMarketEntitled(entitlement, snapshot.portfolio.marketId)) notFound();
  const isLocked = Boolean(stored);

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    {query.locked === "1" && <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 print:hidden">This pilot review is locked. Its evidence and conclusions will not change as the live workspace advances.</div>}
    <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_350px] lg:items-end">
      <div><p className="dq-eyebrow">30-day pilot value review</p><h1 className="dq-h1">From market signal to owner action</h1><p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted-foreground">A customer-ready account of adoption, useful intelligence, decisions, property-manager participation, reviewed outcomes, and the next month’s operating plan.</p><div className="mt-5 flex flex-wrap gap-3 print:hidden"><PrintOwnerBriefingButton />{!isLocked && <form action={lockPilotValueReview}><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Lock this review</button></form>}<Link href="/portfolio-iq/reports" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy">Weekly briefing</Link></div></div>
      <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{isLocked ? "Locked review" : "Live review"}</p><span className={`h-2.5 w-2.5 rounded-full ${isLocked ? "bg-navy" : "bg-teal-600"}`} /></div><p className="mt-3 text-lg font-semibold text-navy">{dateLabel(snapshot.periodStart)} to {dateLabel(snapshot.periodEnd)}</p><p className="mt-2 text-sm leading-6 text-foreground/75">{snapshot.portfolio.name}<br />{snapshot.portfolio.assetCount} assets · {snapshot.portfolio.marketId}</p></aside>
    </header>

    <section className="mt-8 overflow-hidden rounded-xl border border-grid bg-white shadow-sm"><div className="bg-navy p-6 text-white sm:p-8"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Executive conclusion</p><h2 className="mt-3 max-w-4xl text-2xl font-semibold leading-8 sm:text-3xl">{snapshot.executiveHeadline}</h2><p className="mt-3 max-w-4xl text-[15px] leading-7 text-white/75">{snapshot.executiveSummary}</p>{snapshot.successGoal && <p className="mt-5 border-t border-white/15 pt-4 text-sm leading-6 text-white/80"><strong>Customer definition of value:</strong> {snapshot.successGoal}</p>}</div>
      <div className="grid gap-px bg-grid sm:grid-cols-2 lg:grid-cols-4">{[
        ["Useful findings", snapshot.findings.useful, `${percent(snapshot.findings.usefulRate)} of rated findings`],
        ["Decisions initiated", snapshot.decisions.opened, `${snapshot.decisions.actionPlans} with action plans`],
        ["PM responses", snapshot.collaboration.pmResponses, `${snapshot.collaboration.acceptedPlans} plans accepted`],
        ["Outcomes reviewed", snapshot.outcomes.reviewed, `${snapshot.outcomes.improved} improved`],
      ].map(([label, value, detail]) => <article key={String(label)} className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold text-navy">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}</div></section>

    <section className="mt-10 grid gap-6 lg:grid-cols-3">
      <article className="rounded-xl border border-grid bg-white p-6"><p className="dq-eyebrow">Adoption</p><h2 className="dq-h2">The owner is using the system</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Active workspace users</dt><dd className="font-semibold text-navy">{snapshot.adoption.workspaceUsers} / {snapshot.adoption.authorizedUsers}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Cumulative workspace views</dt><dd className="font-semibold text-navy">{snapshot.adoption.workspaceViews}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Verified briefings delivered</dt><dd className="font-semibold text-navy">{snapshot.adoption.deliveredBriefings}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Observed email clicks</dt><dd className="font-semibold text-navy">{snapshot.adoption.observedClicks}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Last workspace view</dt><dd className="font-semibold text-navy">{dateLabel(snapshot.adoption.latestViewAt)}</dd></div></dl></article>
      <article className="rounded-xl border border-grid bg-white p-6"><p className="dq-eyebrow">Decision system</p><h2 className="dq-h2">Attention became accountable work</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Findings surfaced</dt><dd className="font-semibold text-navy">{snapshot.findings.surfaced}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Findings rated</dt><dd className="font-semibold text-navy">{snapshot.findings.rated}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Active decisions</dt><dd className="font-semibold text-navy">{snapshot.decisions.active}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Closed decision loops</dt><dd className="font-semibold text-navy">{snapshot.decisions.loopsClosed}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Median PM response</dt><dd className="font-semibold text-navy">{snapshot.collaboration.medianResponseDays === null ? "Not established" : `${snapshot.collaboration.medianResponseDays.toFixed(1)} days`}</dd></div></dl></article>
      <article className="rounded-xl border border-grid bg-white p-6"><p className="dq-eyebrow">Outcome evidence</p><h2 className="dq-h2">What changed after action</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Improved</dt><dd className="font-semibold text-emerald-700">{snapshot.outcomes.improved}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Worsened</dt><dd className="font-semibold text-rose-700">{snapshot.outcomes.worsened}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Unchanged or inconclusive</dt><dd className="font-semibold text-navy">{snapshot.outcomes.inconclusive}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Implementation confirmed</dt><dd className="font-semibold text-navy">{snapshot.outcomes.implementationConfirmed}</dd></div></dl></article>
    </section>

    <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.8fr]"><article className="rounded-xl border border-grid bg-white p-6"><p className="dq-eyebrow">Financial prioritization</p><h2 className="dq-h2">Asking-rent exposure brought into the decision loop</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-surface-soft p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current prioritized exposure</p><p className="mt-2 text-3xl font-semibold text-navy">{money(snapshot.financial.askingRentPriority)}</p><p className="mt-1 text-xs text-muted-foreground">Across {snapshot.financial.financiallyPrioritizedAssets} assets</p></div><div className="rounded-lg bg-teal-soft p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Linked to period action plans</p><p className="mt-2 text-3xl font-semibold text-navy">{money(snapshot.financial.actionLinkedPriority)}</p><p className="mt-1 text-xs text-muted-foreground">Prioritization only, not realized revenue</p></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">{snapshot.evidenceBoundary}</p></article>
      <aside className="rounded-xl border border-grid bg-surface-soft p-6"><p className="dq-eyebrow">Unresolved work</p><h2 className="dq-h2">What still needs attention</h2><div className="mt-4 space-y-3">{snapshot.unresolved.map((item) => <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-lg border border-grid bg-white p-4 print:block"><span className="text-sm font-semibold text-navy">{item.label}</span><span className="rounded-full bg-navy px-2.5 py-1 text-xs font-bold text-white print:ml-2">{item.count}</span></Link>)}</div></aside></section>

    <section className="mt-10 rounded-xl border border-teal/30 bg-teal-soft p-6 sm:p-8"><p className="dq-eyebrow">Next 30 days</p><h2 className="dq-h2">Recommended operating plan</h2><ol className="mt-5 grid gap-3 sm:grid-cols-2">{snapshot.nextMonthPlan.map((item, index) => <li key={item} className="flex gap-3 rounded-lg border border-grid bg-white p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{index + 1}</span><p className="text-sm leading-6 text-navy">{item}</p></li>)}</ol></section>

    <section className="mt-10 border-t border-grid pt-8 print:hidden"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Review history</p><h2 className="dq-h2">Frozen pilot reviews</h2></div>{isLocked && <Link href="/portfolio-iq/reports/pilot-review" className="text-sm font-semibold text-teal-700">Return to live review →</Link>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{live.priorReviews.map((review) => <Link key={review.id} href={`/portfolio-iq/reports/pilot-review?review=${review.id}`} className="rounded-lg border border-grid bg-white p-4"><p className="text-sm font-semibold text-navy">{dateLabel(review.snapshot.periodStart)} to {dateLabel(review.snapshot.periodEnd)}</p><p className="mt-1 text-xs text-muted-foreground">Locked {dateLabel(review.finalizedAt)} · {review.snapshot.decisions.opened} decisions</p></Link>)}{live.priorReviews.length === 0 && <p className="text-sm text-muted-foreground">No pilot review has been locked yet.</p>}</div></section>
  </main>;
}
