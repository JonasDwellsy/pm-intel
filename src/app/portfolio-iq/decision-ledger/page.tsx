import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { DECISION_LEDGER_STAGE_LABELS } from "@/lib/portfolio-iq/decision-ledger";
import { loadDecisionLedger } from "@/lib/portfolio-iq/decision-ledger.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { implementationStatusLabel, outcomeNextDecisionLabel } from "@/lib/portfolio-iq/outcome-capture";
import { assessmentLabel, recommendationLabel } from "@/lib/portfolio-iq/pm-response";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null | undefined): string {
  return value ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not set";
}

function money(value: number): string { return `$${Math.round(value).toLocaleString("en-US")}`; }

function outcomeLabel(value: string | null): string {
  if (!value) return "Not reviewed";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const stageStyles = {
  action_planned: "bg-surface-soft text-muted-foreground",
  awaiting_pm: "bg-amber-100 text-amber-900",
  owner_review: "bg-orange-soft text-orange-800",
  monitoring: "bg-teal-soft text-teal-800",
  outcome_due: "bg-rose-100 text-rose-800",
  follow_up: "bg-orange-soft text-orange-800",
  closed: "bg-emerald-100 text-emerald-800",
} as const;

export default async function DecisionLedgerPage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const [data, entitlement] = await Promise.all([loadDecisionLedger({ userId, organizationId }), resolveViewerEntitlement()]);
  if (!data || !isMarketEntitled(entitlement, data.portfolio.marketId)) notFound();
  const { summary } = data;
  const pmResponseDetail = summary.medianPmResponseDays === null
    ? "No timed responses"
    : `${summary.medianPmResponseDays.toFixed(1)} day median${summary.measuredPmResponses ? ` · ${summary.onTimePmResponses}/${summary.measuredPmResponses} on time` : ""}`;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_390px] lg:items-end">
      <div><p className="dq-eyebrow">Portfolio accountability</p><h1 className="dq-h1">Decision Ledger</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">One record of what Dwellsy IQ surfaced, what the owner decided, how the property manager responded, and what the later asking-market evidence supported.</p></div>
      <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Current owner attention</p><p className="mt-2 text-3xl font-semibold text-navy">{summary.attentionNow}</p><p className="mt-2 text-sm leading-6 text-foreground/75">Owner reviews, due outcomes, and follow-up decisions requiring attention now.</p></aside>
    </header>

    <section className="mt-7 grid gap-px overflow-hidden rounded-xl border border-grid bg-grid sm:grid-cols-2 lg:grid-cols-5">
      {[["Decisions opened", summary.decisionsOpened, `${summary.activeDecisions} active`], ["PM plans accepted", summary.acceptedPmPlans, pmResponseDetail], ["Implementation confirmed", summary.implementationConfirmed, "Completed or partially completed"], ["Outcomes reviewed", summary.outcomesReviewed, `${summary.improvedOutcomes} improved · ${summary.worsenedOutcomes} worsened`], ["Closed loops", summary.loopsClosed, "Decision record complete"]].map(([label, value, detail]) => <article key={String(label)} className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold text-navy">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></article>)}
    </section>

    <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_340px]">
      <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Decision funnel</p><h2 className="dq-h2">From attention to accountable action</h2><div className="mt-5 grid gap-3 sm:grid-cols-5">{[["Opened", summary.decisionsOpened], ["PM plan", summary.acceptedPmPlans], ["Implemented", summary.implementationConfirmed], ["Reviewed", summary.outcomesReviewed], ["Closed", summary.loopsClosed]].map(([label, count], index) => <div key={String(label)} className="relative rounded-lg bg-surface-soft p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{index + 1}. {label}</p><p className="mt-2 text-2xl font-semibold text-navy">{count}</p></div>)}</div></article>
      <aside className="rounded-xl border border-grid bg-surface-soft p-5"><p className="dq-eyebrow">Asking-rent priority</p><p className="mt-2 text-3xl font-semibold text-navy">{money(summary.askingRentPriority)}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Base annual prioritization across {summary.financiallyPrioritizedAssets} unique portfolio {summary.financiallyPrioritizedAssets === 1 ? "asset" : "assets"}. Assets are counted once even when several decisions reference them.</p></aside>
    </section>

    <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Decision history</p><h2 className="dq-h2">Every active and completed loop</h2></div><Link href="/portfolio-iq/reports" className="text-sm font-semibold text-teal-700 hover:underline">Open weekly briefing →</Link></div>
      {data.rows.length ? <div className="mt-5 space-y-4">{data.rows.map((row) => {
        const financialPriority = row.financialPriorities.reduce((sum, item) => sum + item.amount, 0);
        return <article key={row.signalId} className="overflow-hidden rounded-xl border border-grid bg-white shadow-sm"><div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[1.35fr_0.85fr_0.85fr_0.8fr]"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${stageStyles[row.stage]}`}>{DECISION_LEDGER_STAGE_LABELS[row.stage]}</span><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{row.category} · {row.severity}</span></div><h3 className="mt-3 text-lg font-semibold leading-6 text-navy">{row.headline}</h3><div className="mt-3 flex flex-wrap gap-2">{row.assets.map((asset) => <Link key={asset.id} href={`/portfolio-iq/properties/${asset.slug}`} className="rounded-full border border-grid bg-surface-soft px-2.5 py-1 text-xs font-semibold text-navy">{asset.name}</Link>)}</div>{row.actionPlan && <p className="mt-4 text-sm leading-6 text-foreground/75"><strong className="text-navy">Action:</strong> {row.actionPlan}</p>}</div><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Responsibility</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-xs text-muted-foreground">Owner</dt><dd className="font-semibold text-navy">{row.assignedTo ?? "Unassigned"}</dd></div><div><dt className="text-xs text-muted-foreground">Review date</dt><dd className="font-semibold text-navy">{dateLabel(row.dueAt)}</dd></div>{financialPriority > 0 && <div><dt className="text-xs text-muted-foreground">Asking-rent priority</dt><dd className="font-semibold text-navy">{money(financialPriority)}</dd></div>}</dl></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">PM follow-through</p>{row.pmResponder ? <div className="mt-3 text-sm"><p className="font-semibold text-navy">{row.pmResponder}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{assessmentLabel(row.pmAssessment)}<br />{recommendationLabel(row.pmRecommendation)}{row.pmResponseDays !== null ? <><br />Responded in {row.pmResponseDays.toFixed(1)} days</> : null}</p></div> : <p className="mt-3 text-sm text-muted-foreground">No structured PM response</p>}</div><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Outcome</p><div className="mt-3 text-sm"><p className="font-semibold text-navy">{outcomeLabel(row.outcomeConclusion)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{implementationStatusLabel(row.implementationStatus)}<br />{outcomeNextDecisionLabel(row.nextDecision)}</p>{row.outcomeReviewedAt && <p className="mt-2 text-xs text-muted-foreground">Reviewed {dateLabel(row.outcomeReviewedAt)}</p>}</div></div></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-grid bg-surface-soft px-5 py-3 sm:px-6"><p className="text-xs text-muted-foreground">Decision opened {dateLabel(row.decidedAt)}{row.successMeasure ? ` · Success measure: ${row.successMeasure}` : ""}</p><Link href={`/today/cases/${row.signalId}`} className="text-xs font-semibold text-teal-700 hover:underline">Open complete decision record →</Link></div></article>;
      })}</div> : <div className="mt-5 rounded-xl border border-dashed border-grid bg-white p-10 text-center"><h3 className="text-lg font-semibold text-navy">No owner decisions yet</h3><p className="mt-2 text-sm text-muted-foreground">Decision records will appear here after the owner starts a case from Today.</p></div>}
    </section>

    <footer className="mt-10 border-t border-grid pt-5 text-xs leading-5 text-muted-foreground">Financial figures are gross asking-rent prioritization based on observed listings, approved comps, and owner-controlled assumptions. They do not represent occupancy, signed leases, concessions, effective rent, realized revenue, NOI, or guaranteed performance.</footer>
  </main>;
}
