import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { capturePortfolioMonitoringPeriod } from "@/app/portfolio-iq/actions";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadPortfolioMonitoring } from "@/lib/portfolio-iq/monitoring.server";
import type { PortfolioMonitoringChange } from "@/lib/portfolio-iq/monitoring";

export const dynamic = "force-dynamic";

function severityStyle(value: string): string {
  if (value === "high") return "border-rose-200 bg-rose-50/50";
  if (value === "medium") return "border-amber-200 bg-amber-50/40";
  return "border-grid bg-white";
}

function categoryLabel(value: PortfolioMonitoringChange["category"]): string {
  return ({ rent: "Asking rent", supply: "Listing evidence", comps: "Comparable position", readiness: "Activation", operator: "Operator context", decision: "New decision" })[value];
}

function dateLabel(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function PortfolioChangesPage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const monitoring = await loadPortfolioMonitoring({ userId, organizationId });
  if (!monitoring) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, monitoring.portfolio.marketId)) notFound();

  if (!monitoring.isApproved || !monitoring.baseline || !monitoring.comparison) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
        <DwellsyIqWorkspaceNav />
        <section className="rounded-2xl border border-grid bg-white px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
          <p className="dq-eyebrow">Since your baseline</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Approve the starting point before measuring change</h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">Dwellsy has prepared the launch evidence, but it will not invent a before-and-after comparison. Approving the briefing freezes the exact property, market, comp, and observed operator evidence used as day one.</p>
          <Link href="/portfolio-iq/launch-briefing" className="mt-7 inline-flex rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white hover:bg-navy-700">Review and approve the launch baseline</Link>
        </section>
      </main>
    );
  }

  const materialChanges = monitoring.comparison.changes.filter((change) => change.severity !== "info");
  const readinessChanges = monitoring.comparison.changes.filter((change) => change.severity === "info");
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_390px] lg:items-end">
        <div>
          <p className="dq-eyebrow">Since your baseline</p>
          <h1 className="dq-h1">What changed</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">A reproducible comparison of current asking-market evidence with the launch position you approved on {dateLabel(monitoring.baseline.generatedAt)}.</p>
          <p className="mt-4 text-xs font-medium text-muted-foreground">Current evidence generated {dateLabel(monitoring.current.generatedAt)} · {monitoring.current.market.sourceLabel}</p>
        </div>
        <aside className={`rounded-xl border p-5 ${monitoring.comparison.highPriorityCount ? "border-rose-200 bg-rose-50" : "border-teal/25 bg-teal-soft"}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Owner read</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{monitoring.comparison.materialCount}</p>
          <p className="mt-1 text-sm font-semibold text-navy">material {monitoring.comparison.materialCount === 1 ? "change" : "changes"}</p>
          <p className="mt-2 text-sm leading-6 text-foreground/75">{monitoring.comparison.executiveRead}</p>
        </aside>
      </header>

      <section aria-label="Change summary" className="mt-7 overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[["High priority", String(monitoring.comparison.highPriorityCount), "Prompt owner review"], ["Properties affected", String(monitoring.comparison.affectedAssetCount), `of ${monitoring.portfolio.assetCount} assets`], ["Evidence updates", String(readinessChanges.length), "Activation and coverage changes"], ["Weekly snapshot", monitoring.currentPeriodCaptured ? "Saved" : "Ready", monitoring.currentPeriodKey]].map(([label, value, detail]) => <article key={label} className="border-b border-grid px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="mt-2 text-[28px] font-semibold tracking-tight text-navy">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></article>)}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="dq-eyebrow">Detect and diagnose</p><h2 className="dq-h2">Material movements</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Thresholds suppress ordinary noise. Every item preserves its baseline value, current value, and evidence limitation.</p></div>
          <Link href="/today" className="text-sm font-semibold text-teal-700 hover:underline">Open the decision queue →</Link>
        </div>
        {materialChanges.length ? <div className="mt-5 space-y-4">{materialChanges.map((change) => <article key={change.key} className={`rounded-xl border p-5 sm:p-6 ${severityStyle(change.severity)}`}><div className="grid gap-5 lg:grid-cols-[1fr_270px] lg:items-start"><div><div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em]"><span className={change.severity === "high" ? "text-rose-800" : "text-amber-800"}>{change.severity} priority</span><span className="text-teal-700">{categoryLabel(change.category)}</span>{change.assetName && <span className="text-muted-foreground">{change.assetName}</span>}</div><h3 className="mt-2 text-xl font-semibold leading-7 text-navy">{change.headline}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/75">{change.narrative}</p><div className="mt-4 flex flex-wrap gap-3">{change.assetSlug && <Link href={`/portfolio-iq/properties/${change.assetSlug}`} className="text-xs font-semibold text-teal-700 hover:underline">Investigate property →</Link>}<Link href="/today" className="text-xs font-semibold text-teal-700 hover:underline">Assign or resolve in Today →</Link></div></div><dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-grid bg-white text-sm"><div className="border-r border-grid p-4"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">At launch</dt><dd className="mt-2 font-semibold text-navy">{change.baselineValue}</dd></div><div className="p-4"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Now</dt><dd className="mt-2 font-semibold text-navy">{change.currentValue}</dd></div></dl></div></article>)}</div> : <div className="mt-5 rounded-xl border border-teal/25 bg-teal-soft px-6 py-8"><h3 className="text-xl font-semibold text-navy">No material movement is supported yet</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/75">The current evidence does not cross the rent, listing-volume, comp-position, operator, or portfolio thresholds. Setup progress is shown separately so it is not confused with performance.</p></div>}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Evidence operations</p><h2 className="dq-h2">Readiness changes</h2>{readinessChanges.length ? <div className="mt-4 divide-y divide-grid">{readinessChanges.slice(0, 10).map((change) => <div key={change.key} className="py-3"><p className="font-semibold text-navy">{change.headline}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{change.baselineValue} → {change.currentValue}</p></div>)}</div> : <p className="mt-3 text-sm leading-6 text-muted-foreground">No property-match, URU, comp-review, or monitoring-status changes since launch.</p>}</article>
        <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Period history</p><h2 className="dq-h2">Weekly evidence trail</h2>{monitoring.history.length ? <div className="mt-4 divide-y divide-grid">{monitoring.history.slice(0, 8).map((period) => <div key={period.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-semibold text-navy">{period.periodKey}</p><p className="mt-1 text-xs text-muted-foreground">Captured {dateLabel(period.capturedAt)}</p></div><div className="text-right"><p className="font-semibold text-navy">{period.comparison.materialCount}</p><p className="text-xs text-muted-foreground">material changes</p></div></div>)}</div> : <p className="mt-3 text-sm leading-6 text-muted-foreground">The launch baseline is locked. The first weekly snapshot has not been captured yet.</p>}<form action={capturePortfolioMonitoringPeriod} className="mt-5 border-t border-grid pt-5"><input type="hidden" name="portfolioId" value={monitoring.portfolio.id} /><button className="w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy-700">{monitoring.currentPeriodCaptured ? "Refresh this week's snapshot" : "Capture this week's snapshot"}</button><p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">This preview control is the same idempotent operation the weekly automation will run.</p></form></article>
      </section>
    </main>
  );
}
