import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { PrintOwnerBriefingButton } from "@/components/portfolio-iq/PrintOwnerBriefingButton";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadOwnerBriefing } from "@/lib/portfolio-iq/owner-briefing.server";
import { sendOwnerBriefingPreview } from "./actions";

export const dynamic = "force-dynamic";

function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function money(value: number): string { return `$${Math.round(value).toLocaleString("en-US")}`; }

export default async function OwnerReportsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const [data, entitlement, query] = await Promise.all([loadOwnerBriefing({ userId, organizationId }), resolveViewerEntitlement(), searchParams]);
  if (!data || !isMarketEntitled(entitlement, data.snapshot.portfolio.marketId)) notFound();
  const { snapshot } = data;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    {query.email === "sent" && <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 print:hidden">A preview of this briefing was sent to your account email.</div>}
    {query.email === "failed" && <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 print:hidden">The preview email could not be sent. The briefing remains available here.</div>}

    <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Weekly owner briefing</p><h1 className="dq-h1">One review of markets, assets, comps, and operators</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">A decision-ready summary of what changed, where the portfolio is exposed, who owns the response, and what evidence should be reviewed next.</p><div className="mt-5 flex flex-wrap gap-3 print:hidden"><PrintOwnerBriefingButton /><form action={sendOwnerBriefingPreview}><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Email preview to me</button></form></div></div>
      <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Briefing generated</p><p className="mt-2 text-xl font-semibold text-navy">{dateLabel(snapshot.generatedAt)}</p><p className="mt-2 text-sm leading-6 text-foreground/75">{snapshot.portfolio.name}<br />Cleveland pilot market</p></aside>
    </header>

    <section className="mt-8 overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
      <div className="bg-navy p-6 text-white sm:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-200">Executive read</p><h2 className="mt-3 max-w-4xl text-2xl font-semibold leading-8 sm:text-3xl">{snapshot.executiveHeadline}</h2><p className="mt-3 max-w-4xl text-[15px] leading-7 text-white/75">{snapshot.executiveSummary}</p></div>
      <div className="grid gap-px bg-grid sm:grid-cols-2 lg:grid-cols-4">{[
        ["Active decisions", snapshot.decisions.active, `${snapshot.decisions.due} due now`],
        ["PM follow-up", snapshot.collaboration.awaitingResponse, `${snapshot.collaboration.awaitingOwnerReview} await owner review`],
        ["Financial estimates", snapshot.financial.ready, `${snapshot.financial.incomplete} need setup`],
        ["Outcomes", snapshot.outcomes.ready, `${snapshot.outcomes.waiting} waiting for source`],
      ].map(([label, value, detail]) => <article key={String(label)} className="bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold text-navy">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>)}</div>
    </section>

    <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Attention queue</p><h2 className="dq-h2">The five issues to discuss this week</h2></div><Link href="/today" className="text-sm font-semibold text-teal-700 hover:underline print:hidden">Open the live decision queue →</Link></div>
      <div className="mt-5 space-y-4">{snapshot.attention.map((item, index) => <article key={item.signalId} className="overflow-hidden rounded-xl border border-grid bg-white"><div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[44px_1fr_260px]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{index + 1}</span><div><div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="text-teal-700">{item.category}</span><span className={item.severity === "high" ? "text-orange-700" : "text-muted-foreground"}>{item.severity} priority</span></div><h3 className="mt-2 text-xl font-semibold leading-7 text-navy">{item.headline}</h3><p className="mt-2 text-sm leading-6 text-foreground/75">{item.narrative}</p><div className="mt-4 flex flex-wrap gap-2">{item.exposedAssets.map((asset) => <Link key={asset.slug} href={`/portfolio-iq/properties/${asset.slug}`} className="rounded-full border border-grid bg-surface-soft px-3 py-1 text-xs font-semibold text-navy hover:border-teal/40">{asset.name}</Link>)}</div></div><aside className="rounded-lg bg-surface-soft p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Follow-through</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Owner</dt><dd className="text-right font-semibold text-navy">{item.assignedTo ?? "Unassigned"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Due</dt><dd className="font-semibold text-navy">{dateLabel(item.dueAt)}</dd></div><div><dt className="text-muted-foreground">Operators</dt><dd className="mt-1 font-semibold text-navy">{[...new Set(item.exposedAssets.flatMap((asset) => asset.operatorName ? [asset.operatorName] : []))].join(", ") || "Match pending"}</dd></div></dl><Link href={`/today/cases/${item.signalId}`} className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline print:hidden">Open decision case →</Link></aside></div></article>)}</div>
    </section>

    <section className="mt-10 grid gap-6 lg:grid-cols-3">
      <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Financial prioritization</p><h2 className="dq-h2">Verified range</h2>{snapshot.financial.ready ? <><p className="mt-4 text-3xl font-semibold text-navy">{money(snapshot.financial.base)}</p><p className="mt-1 text-xs text-muted-foreground">Base annual asking-rent priority</p><div className="mt-4 rounded-lg bg-surface-soft p-4 text-sm text-navy"><strong>{money(snapshot.financial.conservative)}</strong> conservative<br /><strong>{money(snapshot.financial.upside)}</strong> upside</div></> : <p className="mt-4 text-sm leading-6 text-muted-foreground">No portfolio estimate is shown until comp evidence and owner assumptions are verified.</p>}<Link href="/portfolio-iq/financial-impact" className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline print:hidden">Review calculations →</Link></article>
      <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">PM collaboration</p><h2 className="dq-h2">Response status</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Awaiting response</dt><dd className="font-semibold text-navy">{snapshot.collaboration.awaitingResponse}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Overdue</dt><dd className="font-semibold text-navy">{snapshot.collaboration.overdue}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Owner review</dt><dd className="font-semibold text-navy">{snapshot.collaboration.awaitingOwnerReview}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Accepted plans</dt><dd className="font-semibold text-navy">{snapshot.collaboration.acceptedPlans}</dd></div></dl><Link href="/portfolio-iq/collaboration" className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline print:hidden">Open collaboration center →</Link></article>
      <article className="rounded-xl border border-grid bg-white p-5 sm:p-6"><p className="dq-eyebrow">Outcome reviews</p><h2 className="dq-h2">What changed after action</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Ready to review</dt><dd className="font-semibold text-navy">{snapshot.outcomes.ready}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Due</dt><dd className="font-semibold text-navy">{snapshot.outcomes.due}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Waiting for source</dt><dd className="font-semibold text-navy">{snapshot.outcomes.waiting}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Reviewed</dt><dd className="font-semibold text-navy">{snapshot.outcomes.reviewed}</dd></div></dl><Link href="/portfolio-iq/outcomes" className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline print:hidden">Open outcome reviews →</Link></article>
    </section>

    <section className="mt-10 grid gap-6 border-t border-grid pt-8 lg:grid-cols-[1fr_0.8fr]"><article><p className="dq-eyebrow">Evidence health</p><h2 className="dq-h2">What this briefing can support</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{snapshot.sources.map((source) => <div key={source.label} className="rounded-lg border border-grid bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-navy">{source.label}</p><span className={`h-2.5 w-2.5 rounded-full ${source.status === "current" ? "bg-teal-600" : "bg-amber-500"}`} /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{source.detail}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-muted-foreground">This briefing uses advertised asking-market evidence. It does not measure occupancy, signed leases, concessions, effective rent, or NOI.</p></article><aside className="rounded-xl border border-grid bg-surface-soft p-5 sm:p-6"><p className="dq-eyebrow">Delivery history</p><h2 className="dq-h2">Weekly email</h2>{data.deliveries.length ? <div className="mt-4 divide-y divide-grid">{data.deliveries.map((delivery) => <div key={delivery.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-semibold capitalize text-navy">{delivery.status}</p><p className="text-xs text-muted-foreground">{dateLabel(delivery.createdAt)}</p></div><p className="max-w-[190px] truncate text-xs text-muted-foreground">{delivery.email}</p></div>)}</div> : <p className="mt-4 text-sm leading-6 text-muted-foreground">No scheduled owner briefing has been delivered yet.</p>}<p className="mt-4 text-xs leading-5 text-muted-foreground">{data.digestPreference?.enabled ? "Weekly delivery is enabled and sends only when material new evidence is available." : "Weekly delivery is off. Enable it from Today when the review format is approved."}</p></aside></section>
  </main>;
}
