import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadLaunchBriefing } from "@/lib/portfolio-iq/launch-briefing.server";
import { launchReadinessPercent } from "@/lib/portfolio-iq/launch-briefing";

export const dynamic = "force-dynamic";

function statusLabel(value: string): string {
  return ({ ready: "Ready", monitoring: "Monitoring", needs_confirmation: "Needs confirmation", operator_outreach: "Operator outreach", dwellsy_onboarding: "Dwellsy onboarding", matched: "Matched", needs_review: "Review", observed: "Observed", partial: "Partial", unknown: "Pending", locked: "Locked", proposed: "Proposed", not_started: "Not started" } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

function money(value: number | null): string {
  return value === null ? "Not enough evidence" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function percent(value: number | null): string {
  if (value === null) return "Not shown until comps are locked";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}% vs comps`;
}

export default async function LaunchBriefingPage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const briefing = await loadLaunchBriefing({ userId, organizationId });
  if (!briefing) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, briefing.snapshot.portfolio.marketId)) notFound();
  const { snapshot } = briefing;
  const readiness = launchReadinessPercent(snapshot);
  const approvalDate = briefing.record?.approvedAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) ?? null;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_390px] lg:items-end">
        <div>
          <p className="dq-eyebrow">Portfolio launch briefing</p>
          <h1 className="dq-h1">Your starting position</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">The first decision-grade view of {snapshot.portfolio.name}, combining portfolio exposure, Cleveland asking-market evidence, comparable positioning, and observed operator context.</p>
          <p className="mt-4 text-xs font-medium text-muted-foreground">{snapshot.market.sourceLabel} · Generated {new Date(snapshot.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
        </div>
        <aside className={`rounded-xl border p-5 ${briefing.isApproved ? "border-emerald-200 bg-emerald-50" : "border-teal/25 bg-teal-soft"}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">{briefing.isApproved ? "Launch baseline approved" : "Launch readiness"}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{briefing.isApproved ? "Baseline locked" : `${readiness}%`}</p>
          <p className="mt-2 text-sm leading-6 text-foreground/75">{briefing.isApproved ? `Approved ${approvalDate}. Future briefings can now explain what changed from this starting point.` : `${snapshot.readiness.openTasks} internal activation tasks remain. You can approve the baseline while Dwellsy continues resolving clearly labeled setup gaps.`}</p>
        </aside>
      </header>

      <section className="mt-7 rounded-xl border border-teal/25 bg-teal-soft p-5 sm:p-6">
        <p className="dq-eyebrow">Executive read</p><h2 className="mt-2 max-w-5xl text-2xl font-semibold leading-9 text-navy">{snapshot.executiveRead}</h2>
        <p className="mt-3 text-sm leading-6 text-foreground/75">This is asking-market intelligence. It does not represent occupancy, signed leases, effective rent, or a verified property-management contract.</p>
      </section>

      <section aria-label="Launch summary" className="mt-7 overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          {[["Portfolio", `${snapshot.portfolio.assetCount} assets`, `${snapshot.portfolio.buildingCount} physical buildings`], ["Monitoring", `${snapshot.readiness.monitoring}/${snapshot.portfolio.assetCount}`, "Ready or monitoring"], ["Property identity", `${snapshot.readiness.matched}/${snapshot.portfolio.assetCount}`, "Matched to Dwellsy evidence"], ["Listing coverage", `${snapshot.readiness.uruCovered}/${snapshot.portfolio.assetCount}`, "Observed or partial URU coverage"], ["Comparable sets", `${snapshot.readiness.compsLocked}/${snapshot.portfolio.assetCount}`, "Reviewed and locked"]].map(([label, value, detail]) => <article key={label} className="border-b border-grid px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="mt-2 text-[27px] font-semibold tracking-tight text-navy">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></article>)}
        </div>
      </section>

      <section className="mt-10">
        <p className="dq-eyebrow">First decisions</p><h2 className="dq-h2">Where the owner should focus first</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These are the highest-ranked current findings, not a generic portfolio checklist.</p>
        {snapshot.decisions.length ? <div className="mt-5 grid gap-4 lg:grid-cols-3">{snapshot.decisions.map((decision, index) => <article key={decision.signalId} className={`rounded-xl border p-5 ${decision.severity === "high" ? "border-rose-200 bg-rose-50/45" : "border-grid bg-white"}`}><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{index + 1}</span><span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{decision.assetName ?? "Portfolio"}</span></div><h3 className="mt-4 text-lg font-semibold leading-6 text-navy">{decision.headline}</h3><p className="mt-2 text-sm leading-6 text-foreground/75">{decision.narrative}</p>{decision.ownerQuestion && <p className="mt-4 border-t border-grid pt-3 text-sm font-semibold leading-6 text-navy">{decision.ownerQuestion}</p>}<div className="mt-4 flex gap-3">{decision.assetSlug && <Link href={`/portfolio-iq/properties/${decision.assetSlug}`} className="text-xs font-semibold text-teal-700 hover:underline">Open property →</Link>}<Link href={`/today/cases/${decision.signalId}`} className="text-xs font-semibold text-teal-700 hover:underline">Decision case →</Link></div></article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-grid px-6 py-10 text-center text-sm text-muted-foreground">No decision findings are active at this baseline.</div>}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="dq-eyebrow">Property lineup</p><h2 className="dq-h2">What Dwellsy can support today</h2></div><Link href="/portfolio-iq#properties" className="text-sm font-semibold text-teal-700 hover:underline">Open full portfolio →</Link></div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-grid bg-white"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><thead className="bg-surface-soft text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Property</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Readiness</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Observed rent</th><th className="px-4 py-3">Comp position</th><th className="px-4 py-3">Operator context</th></tr></thead><tbody className="divide-y divide-grid">{snapshot.assets.map((asset) => <tr key={asset.id}><td className="px-4 py-4"><Link href={`/portfolio-iq/properties/${asset.slug}`} className="font-semibold text-navy hover:underline">{asset.name}</Link><p className="mt-1 text-xs text-muted-foreground">{asset.location} · {asset.buildings} {asset.buildings === 1 ? "building" : "buildings"}</p></td><td className="px-4 py-4 text-foreground/75">{asset.product}</td><td className="px-4 py-4"><span className="rounded-full border border-grid bg-surface-soft px-2.5 py-1 text-xs font-semibold text-navy">{statusLabel(asset.readinessStatus)}</span></td><td className="px-4 py-4 text-xs leading-5 text-foreground/75">{statusLabel(asset.matchStatus)} · URU {statusLabel(asset.uruStatus)} · Comps {statusLabel(asset.compStatus)}</td><td className="px-4 py-4 font-semibold text-navy">{money(asset.askingRent)}<p className="mt-1 text-xs font-normal text-muted-foreground">{asset.observationCount} observations</p></td><td className="px-4 py-4 text-xs font-semibold text-navy">{percent(asset.askingRentVsComps)}</td><td className="px-4 py-4"><p className="font-semibold text-navy">{asset.observedOperatorName ?? "Being resolved"}</p><p className="mt-1 text-xs text-muted-foreground">{asset.operatorRank ?? (asset.operatorStatus === "matched" ? "Operator IQ matched" : "No benchmark substituted")}</p></td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Market baseline</p><h2 className="dq-h2">{snapshot.market.heading}</h2><p className="mt-3 text-sm leading-6 text-foreground/75">{snapshot.market.narrative}</p>{snapshot.market.historicalRead && <p className="mt-4 rounded-lg bg-surface-soft px-4 py-3 text-sm leading-6 text-navy">{snapshot.market.historicalRead}</p>}<Link href="/market-iq" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">Explore Market IQ →</Link></article>
        <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Known exceptions</p><h2 className="dq-h2">What Dwellsy is still resolving</h2>{snapshot.exceptions.length ? <div className="mt-4 max-h-80 divide-y divide-grid overflow-y-auto">{snapshot.exceptions.slice(0, 12).map((item, index) => <div key={`${item.assetName}-${item.type}-${index}`} className="py-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-navy">{item.assetName}</p><span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">{item.type}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>)}</div> : <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">No activation exceptions remain.</p>}<Link href="/onboarding" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">Open activation progress →</Link></article>
      </section>

      <section className={`mt-10 rounded-xl border p-6 ${briefing.isApproved ? "border-emerald-200 bg-emerald-50" : "border-navy bg-navy text-white"}`}>
        {briefing.isApproved ? <div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">Monitoring baseline active</p><h2 className="mt-2 text-2xl font-semibold text-navy">Your portfolio is launched</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900/80">Today and future briefings can now measure new evidence against this approved starting position.</p></div><div className="flex gap-3"><Link href="/portfolio-iq/changes" className="rounded-md border border-navy bg-white px-5 py-3 text-sm font-semibold text-navy">See what changed</Link><Link href="/today" className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">Open Today →</Link></div></div> : <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-200">Launch approval</p><h2 className="mt-2 text-2xl font-semibold">Establish this as the monitoring baseline</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">The guided review confirms the portfolio and operator lineup, captures reactions to the first findings, and then freezes this baseline.</p></div><Link href="/portfolio-iq/acceptance" className="rounded-md bg-white px-5 py-3 text-center text-sm font-semibold text-navy">Start guided launch review →</Link></div>}
      </section>
    </main>
  );
}
