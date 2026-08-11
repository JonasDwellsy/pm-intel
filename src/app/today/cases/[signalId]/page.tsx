import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { buildDecisionBaseline, loadDecisionCase } from "@/lib/portfolio-iq/decision-case.server";
import { monitoringStatus, parseDecisionBaseline, MONITORING_WINDOWS } from "@/lib/portfolio-iq/decision-case";
import { portfolioDecisionLabel } from "@/lib/portfolio-iq/decision";
import { savePortfolioDecisionCase, updatePortfolioSignalDecision } from "@/app/portfolio-iq/actions";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return "Not available";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function dollars(value: number | null | undefined): string {
  return value == null ? "Not enough evidence" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function percent(value: number | null | undefined): string {
  if (value == null) return "Not enough evidence";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function days(value: number | null | undefined): string {
  return value == null ? "Not enough evidence" : `${Math.round(value)} days`;
}

function sourceLabel(source: string): string {
  return ({
    owner_portfolio: "Owner portfolio",
    dwellsy_iq_trends: "Dwellsy IQ Trends",
    historical_listing_export: "Historical listing export",
    approved_comps: "Approved comps",
    observed_operator_activity: "Observed operator activity",
    activation_workflow: "Activation workflow",
  } as Record<string, string>)[source] ?? source.replaceAll("_", " ");
}

function statusCopy(status: ReturnType<typeof monitoringStatus>): string {
  if (status === "resolved") return "Resolved";
  if (status === "due") return "Follow-up due";
  if (status === "monitoring") return "Monitoring";
  return "Plan needed";
}

export default async function DecisionCasePage({ params }: { params: Promise<{ signalId: string }> }) {
  if (!portfolioIqPreviewEnabled()) notFound();
  if (!(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const { signalId } = await params;
  const caseData = await loadDecisionCase({ userId, organizationId, signalId });
  if (!caseData) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, caseData.portfolio.marketId)) notFound();

  const decision = caseData.signal.decision;
  const savedBaseline = parseDecisionBaseline(decision?.baselineEvidence);
  const baseline = savedBaseline ?? buildDecisionBaseline(caseData, new Date());
  const caseStatus = monitoringStatus({ state: decision?.state, dueAt: decision?.dueAt, baselineCapturedAt: decision?.baselineCapturedAt });
  const latestTrend = caseData.trendPulses[0]?.trendSource ?? null;
  const currentProperty = caseData.property?.performance ?? null;
  const hasNewPropertyCut = Boolean(savedBaseline?.property?.availableThrough && caseData.property?.availableThrough && caseData.property.availableThrough.getTime() > new Date(savedBaseline.property.availableThrough).getTime());

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Link href="/today" className="hover:text-teal-700">Today</Link><span>/</span><span>Decision case</span>
      </nav>

      <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_310px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="dq-eyebrow">Detect, diagnose, decide, monitor</p>
            <span className="rounded-full border border-teal/25 bg-teal-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800">{statusCopy(caseStatus)}</span>
          </div>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-navy sm:text-4xl">{caseData.signal.headline}</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-foreground/75">{caseData.signal.narrative}</p>
        </div>
        <aside className="rounded-xl border border-grid bg-surface-soft p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Case status</p>
          <p className="mt-2 text-xl font-semibold text-navy">{portfolioDecisionLabel(decision?.state)}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Owner</dt><dd className="font-semibold text-navy">{decision?.assignedTo ?? "Unassigned"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Due</dt><dd className="font-semibold text-navy">{dateLabel(decision?.dueAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Opened</dt><dd className="font-semibold text-navy">{dateLabel(caseData.signal.firstSeenAt)}</dd></div>
          </dl>
        </aside>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <article className="overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
            <div className="border-b border-grid px-5 py-5 sm:px-6">
              <p className="dq-eyebrow">Evidence at detection</p>
              <h2 className="dq-h2">The baseline for this decision</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {savedBaseline ? `Frozen on ${dateLabel(savedBaseline.capturedAt)}. Later source refreshes cannot rewrite this record.` : "This current evidence will be frozen when the action plan is saved."}
              </p>
            </div>
            <div className="grid gap-px bg-grid sm:grid-cols-2">
              <section className="bg-white p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Property and comps</p>
                <h3 className="mt-2 font-semibold text-navy">{baseline.asset?.name ?? "Market-level case"}</h3>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Observed asking rent</dt><dd className="font-semibold text-navy">{dollars(baseline.property?.askingRent)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">90-day move</dt><dd className="font-semibold text-navy">{percent(baseline.property?.askingRentChange90d)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Listing velocity</dt><dd className="font-semibold text-navy">{days(baseline.property?.medianDom)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Comp evidence</dt><dd className="font-semibold capitalize text-navy">{baseline.property?.compStatus ?? "Not available"} · {baseline.property?.compCount ?? 0}</dd></div>
                </dl>
                {caseData.signal.asset && <Link href={`/portfolio-iq/properties/${caseData.signal.asset.slug}`} className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline">Open property evidence →</Link>}
              </section>
              <section className="bg-white p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Operator context</p>
                <h3 className="mt-2 font-semibold text-navy">{baseline.asset?.observedOperatorName ?? "Operator not observed"}</h3>
                {baseline.operator?.status === "matched" ? (
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Market rank</dt><dd className="font-semibold text-navy">#{baseline.operator.overallRank ?? "–"} of {baseline.operator.overallRankTotal ?? "–"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lease-up speed</dt><dd className="font-semibold text-navy">{days(baseline.operator.leaseUpDom)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Listings · T12</dt><dd className="font-semibold text-navy">{baseline.operator.t12Listings?.toLocaleString("en-US") ?? "–"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Benchmark through</dt><dd className="font-semibold text-navy">{dateLabel(baseline.operator.dataAsOf)}</dd></div>
                  </dl>
                ) : <p className="mt-3 text-sm leading-6 text-muted-foreground">No exact Operator IQ match was substituted for this observed assignment.</p>}
                {caseData.operatorResponse?.scorecardHref && <Link href={caseData.operatorResponse.scorecardHref} className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline">Open Operator IQ scorecard →</Link>}
              </section>
            </div>
            <div className="border-t border-grid bg-surface-soft px-5 py-4 sm:px-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Connected sources</p>
              <div className="mt-2 flex flex-wrap gap-2">{baseline.sources.map((source) => <span key={source} className="rounded-full border border-grid bg-white px-2.5 py-1 text-xs text-navy">{sourceLabel(source)}</span>)}</div>
            </div>
          </article>

          <article className="rounded-xl border border-grid bg-white p-5 shadow-sm sm:p-6">
            <p className="dq-eyebrow">Decide</p>
            <h2 className="dq-h2">Set the action plan</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Give the issue a responsible owner, a concrete action, and a measurable follow-up. Saving the first plan freezes the evidence above.</p>
            <form action={savePortfolioDecisionCase} className="mt-6 grid gap-5 sm:grid-cols-2">
              <input type="hidden" name="signalId" value={caseData.signal.id} />
              <label className="text-sm font-semibold text-navy">Responsible owner
                <input name="assignedTo" required maxLength={120} defaultValue={decision?.assignedTo ?? ""} placeholder="Person or team" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" />
              </label>
              <label className="text-sm font-semibold text-navy">Due date
                <input type="date" name="dueAt" required defaultValue={decision?.dueAt?.toISOString().slice(0, 10) ?? ""} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" />
              </label>
              <label className="sm:col-span-2 text-sm font-semibold text-navy">Action to take
                <textarea name="actionPlan" required maxLength={1500} rows={4} defaultValue={decision?.actionPlan ?? ""} placeholder="Example: Review the 2-bedroom asking-rent premium with the property manager and document whether condition, amenities, and velocity support it." className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" />
              </label>
              <label className="sm:col-span-2 text-sm font-semibold text-navy">How we will know it worked
                <textarea name="successMeasure" required maxLength={600} rows={2} defaultValue={decision?.successMeasure ?? ""} placeholder="Example: Confirm the premium is supported, or approve a revised asking-rent range and review velocity after 30 days." className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" />
              </label>
              <label className="text-sm font-semibold text-navy">Monitoring window
                <select name="monitoringWindowDays" defaultValue={String(decision?.monitoringWindowDays ?? 30)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal">
                  {MONITORING_WINDOWS.map((window) => <option key={window} value={window}>{window} days</option>)}
                </select>
              </label>
              <div className="flex items-end"><button className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">{decision?.actionPlan ? "Update action plan" : "Start decision case"}</button></div>
            </form>
          </article>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-teal/25 bg-teal-soft p-5 sm:p-6">
            <p className="dq-eyebrow">Monitor</p>
            <h2 className="dq-h2">Source health and follow-up</h2>
            <div className="mt-5 space-y-3">
              {[
                ["Dwellsy IQ Trends", latestTrend ? `Through ${dateLabel(latestTrend.availableThrough)}` : "Refresh pending", true],
                ["Property listing history", caseData.property ? `Through ${dateLabel(caseData.property.availableThrough)}` : "Property match pending", Boolean(caseData.property)],
                ["Operator IQ benchmark", caseData.operatorResponse?.status === "matched" ? `Through ${dateLabel(caseData.operatorResponse.dataAsOf)}` : "Exact match pending", caseData.operatorResponse?.status === "matched"],
                ["Live listing response", "Feed paused", false],
              ].map(([label, detail, healthy]) => (
                <div key={String(label)} className="flex items-start justify-between gap-3 rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm">
                  <div><p className="font-semibold text-navy">{String(label)}</p><p className="mt-0.5 text-xs text-muted-foreground">{String(detail)}</p></div>
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${healthy ? "bg-teal-600" : "bg-amber-500"}`} aria-label={healthy ? "Available" : "Limited"} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">No live price-change or response claim is generated while the listing feed is paused.</p>
          </section>

          <section className="rounded-xl border border-grid bg-white p-5 sm:p-6">
            <p className="dq-eyebrow">Current reading</p>
            <h2 className="dq-h2">Change since baseline</h2>
            {!savedBaseline ? <p className="mt-3 text-sm leading-6 text-muted-foreground">Save the action plan to establish an immutable baseline.</p> : hasNewPropertyCut ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Asking rent</dt><dd className="font-semibold text-navy">{dollars(currentProperty?.askingRent)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">90-day move</dt><dd className="font-semibold text-navy">{percent(currentProperty?.askingRentChange90d)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Velocity</dt><dd className="font-semibold text-navy">{days(currentProperty?.medianDom)}</dd></div>
              </dl>
            ) : <p className="mt-3 text-sm leading-6 text-muted-foreground">No newer property-level source observation is available yet. The baseline remains the current reading.</p>}
            {decision?.successMeasure && <div className="mt-5 rounded-lg bg-surface-soft p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Success measure</p><p className="mt-2 text-sm leading-6 text-navy">{decision.successMeasure}</p></div>}
          </section>

          <section className="rounded-xl border border-grid bg-white p-5 sm:p-6">
            <p className="dq-eyebrow">Case controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {caseData.signal.asset?.slug && <Link href={`/portfolio-iq/properties/${caseData.signal.asset.slug}/pm-brief?signalId=${signalId}`} className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy">Prepare PM brief</Link>}
              <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signalId} /><button name="decisionAction" value="snooze" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy">Snooze 7 days</button></form>
              {decision?.state === "resolved" ? (
                <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signalId} /><button name="decisionAction" value="reopen" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Reopen</button></form>
              ) : (
                <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signalId} /><button name="decisionAction" value="resolve" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Resolve case</button></form>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-grid bg-white p-5 sm:p-6">
            <p className="dq-eyebrow">Activity</p>
            {decision?.events.length ? <div className="mt-3 divide-y divide-grid">{decision.events.map((event) => (
              <div key={event.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold capitalize text-navy">{event.action.replaceAll("_", " ")}</span><time className="text-xs text-muted-foreground">{dateLabel(event.createdAt)}</time></div>{event.note && <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{event.note}</p>}</div>
            ))}</div> : <p className="mt-3 text-sm text-muted-foreground">Activity begins when the first plan is saved.</p>}
          </section>
        </aside>
      </section>
    </main>
  );
}
