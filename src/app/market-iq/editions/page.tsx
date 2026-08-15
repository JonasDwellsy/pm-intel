import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import { buildMarketIqEditionWorkflow } from "@/lib/market-iq/report/edition-workflow";
import { applyMarketIqReportScope, buildMarketIqCoveragePreflight } from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_STYLE = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  review: "bg-amber-50 text-amber-900 ring-amber-200",
  blocked: "bg-rose-50 text-rose-800 ring-rose-200",
} as const;

function dateLabel(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "None";
}

export default async function MarketIqEditionsPage({ searchParams }: { searchParams: Promise<{ activated?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const [composer, recipients, publishedCount] = await Promise.all([
    loadMarketIqReportComposer(organizationId),
    prisma.marketIqReportRecipient.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, kind: true } }),
    prisma.marketIqReport.count({ where: { organizationId, marketId: CLEVELAND_MARKET_ID, status: "published" } }),
  ]);
  if (!composer) notFound();
  const query = await searchParams;
  const current = applyMarketIqReportScope(composer.preview.snapshot, composer.initialSelection);
  const prior = composer.priorEdition ? { ...composer.priorEdition, snapshot: applyMarketIqReportScope(composer.priorEdition.snapshot, composer.initialSelection) } : null;
  const comparison = compareMarketIqEditions(current, prior);
  const coverage = buildMarketIqCoveragePreflight(current);
  const workflow = buildMarketIqEditionWorkflow({ current, prior: prior?.snapshot ?? null, source: composer.preview.source, coverageCounts: coverage.counts, comparison });
  const latestSends = prior ? await prisma.marketIqReportSend.findMany({
    where: { organizationId, reportId: prior.id, deliveryStatus: { in: ["sent", "delivered"] } },
    orderBy: { createdAt: "desc" },
    select: { recipient: { select: { id: true, name: true, email: true, kind: true } }, deliveredAt: true, sentAt: true },
  }) : [];
  const priorAudience = [...new Map(latestSends.map((send) => [send.recipient.id, { ...send.recipient, deliveredAt: send.deliveredAt, sentAt: send.sentAt }])).values()];
  const priorAudienceIds = new Set(priorAudience.map((recipient) => recipient.id));
  const directoryOnly = recipients.filter((recipient) => !priorAudienceIds.has(recipient.id));

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Edition workflow</span></nav>
    {query.activated === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Setup complete. Your first saved-scope edition is assembled below.</p>}
    <header className="mt-6 grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Recurring client advisory</p><h1 className="dq-h1">Prepare the next Cleveland edition</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Market IQ has assembled the latest Trends IQ evidence using your saved brand, geography, and segment defaults. Review what changed, confirm the evidence, then open the editorial and publication controls.</p><Link href="/market-iq/get-started" className="mt-4 inline-block text-sm font-semibold text-teal-800">Edit brand and market defaults →</Link></div><aside className="rounded-xl bg-navy p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Edition state</p><p className="mt-2 text-xl font-semibold">{workflow.state === "launch" ? "Launch baseline" : workflow.state === "new_period" ? "New data available" : "Same reporting period"}</p><p className="mt-2 text-sm leading-6 text-white/70">Current cutoff: {dateLabel(workflow.currentPeriodEnd)}{workflow.priorPeriodEnd ? ` · Prior cutoff: ${dateLabel(workflow.priorPeriodEnd)}` : ""}</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reportable evidence</p><p className="mt-3 text-3xl font-semibold text-navy">{coverage.counts.reportable}</p><p className="mt-1 text-xs text-slate-500">Trends IQ cells in saved scope</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Material changes</p><p className="mt-3 text-3xl font-semibold text-navy">{comparison.findings.length}</p><p className="mt-1 text-xs text-slate-500">since the prior frozen edition</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prior audience</p><p className="mt-3 text-3xl font-semibold text-navy">{priorAudience.length}</p><p className="mt-1 text-xs text-slate-500">recipients to consider carrying forward</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Edition history</p><p className="mt-3 text-3xl font-semibold text-navy">{publishedCount}</p><p className="mt-1 text-xs text-slate-500">immutable published reads</p></article></section>

    <section className="mt-8 grid gap-7 xl:grid-cols-[1fr_380px]">
      <div className="space-y-7">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Change review</p><h2 className="dq-h2">{comparison.heading}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{comparison.narrative}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${comparison.state === "changed" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{comparison.state}</span></div>{comparison.findings.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{comparison.findings.map((finding) => <article key={finding.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-wider text-orange-700">{finding.importance} priority</span><span className="text-[10px] uppercase text-slate-400">{finding.geographyType}</span></div><p className="mt-2 text-sm font-semibold leading-5 text-navy">{finding.headline}</p><p className="mt-2 text-xs leading-5 text-slate-500">{finding.detail}</p></article>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No materiality threshold was crossed. The PM can still publish a dated edition if regular client cadence calls for one.</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Audience carry-forward</p><h2 className="dq-h2">Who received the prior edition</h2><p className="mt-2 text-sm leading-6 text-slate-600">This is planning context only. Publishing the edition will not email anyone.</p>{priorAudience.length ? <div className="mt-5 divide-y divide-slate-100">{priorAudience.map((recipient) => <article key={recipient.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-navy">{recipient.name}</p><p className="mt-1 text-xs text-slate-500">{recipient.email} · {recipient.kind}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">Consider for next edition</span></article>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">The prior edition has no recorded audience. Add recipients after publishing the baseline.</p>}{directoryOnly.length > 0 && <p className="mt-4 text-xs leading-5 text-slate-500">{directoryOnly.length} additional saved {directoryOnly.length === 1 ? "recipient is" : "recipients are"} available in the distribution center.</p>}</section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Readiness</p><h2 className="dq-h2">Publication checks</h2><div className="mt-5 space-y-3">{workflow.checks.map((check) => <article key={check.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-navy">{check.label}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ring-1 ${STATUS_STYLE[check.status]}`}>{check.status}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{check.detail}</p></article>)}</div>{workflow.canPrepare ? <Link href="/market-iq/report?edition=next" className="mt-6 block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white">Open review and publish controls</Link> : <p className="mt-6 rounded-md bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">Resolve blocked checks before preparing a client edition.</p>}<p className="mt-3 text-xs leading-5 text-slate-500">Opening the controls does not publish or send anything. Publication freezes the reviewed evidence into a new link.</p></section>
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">After publication</p><p className="mt-2 text-lg font-semibold text-navy">Return to the audience</p><p className="mt-2 text-sm leading-6 text-slate-600">The distribution center will show the new edition alongside the saved directory and delivery history.</p><Link href="/market-iq/distribution" className="mt-4 inline-block text-sm font-semibold text-teal-800">Open distribution center →</Link></section>
      </aside>
    </section>
  </main>;
}
