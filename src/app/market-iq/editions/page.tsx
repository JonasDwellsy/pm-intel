import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { organizationHasMarketIqAccess, resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import { buildEditionEnrollmentReadiness } from "@/lib/market-iq/report/edition-enrollment";
import { buildMarketIqEditionWorkflow } from "@/lib/market-iq/report/edition-workflow";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { applyMarketIqReportScope, buildMarketIqCoveragePreflight } from "@/lib/market-iq/report/scope";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { prisma } from "@/lib/prisma";
import { checkForRecurringMarketIqEdition, setMarketIqRecurringEnrollment } from "@/app/market-iq/editions/actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  review: "bg-amber-50 text-amber-900 ring-amber-200",
  blocked: "bg-rose-50 text-rose-800 ring-rose-200",
} as const;

function dateLabel(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "None";
}

export default async function MarketIqEditionsPage({ searchParams }: { searchParams: Promise<{ activated?: string; refresh?: string; enrollment?: string; market?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  if (!access.capabilities.useRecurringEditions) redirect("/market-iq/subscribe?upgrade=client_advisory");
  const [query, organizationSetup] = await Promise.all([
    searchParams,
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { brandProfile: { select: { id: true } }, marketIqWorkspacePreference: true, marketIqMarketPreferences: true },
    }),
  ]);
  const workspacePreference = organizationSetup?.marketIqWorkspacePreference ?? null;
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: workspacePreference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket || !isMarketEntitled(access.entitlement, activeMarket.id)) redirect("/market-iq/subscribe");
  const preference = organizationSetup?.marketIqMarketPreferences.find((item) => item.marketId === activeMarket.id) ?? null;
  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  const [composer, recipients, recentReports, recurringDraft, latestOrchestration, organizationHasAccess] = await Promise.all([
    loadMarketIqReportComposer(organizationId, activeMarket.id),
    prisma.marketIqReportRecipient.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, kind: true } }),
    prisma.marketIqReport.findMany({
      where: { organizationId, marketId: activeMarket.id },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        periodLabel: true,
        publicToken: true,
        status: true,
        publishedAt: true,
        snapshot: true,
        distributionCampaigns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, _count: { select: { recipients: true } } },
        },
        sends: {
          where: { OR: [{ deliveryStatus: "sent" }, { deliveredAt: { not: null } }] },
          select: { id: true },
        },
      },
    }),
    prisma.marketIqEditionDraft.findFirst({
      where: { organizationId, marketId: activeMarket.id, status: { in: ["ready", "reviewing"] } },
      orderBy: { detectedAt: "desc" },
      select: { id: true, periodEnd: true, materialChangeCount: true, detectedAt: true },
    }),
    prisma.marketIqEditionOrchestrationItem.findFirst({
      where: { organizationId, marketId: activeMarket.id },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        detail: true,
        createdAt: true,
        run: { select: { dryRun: true, sourceAvailableThrough: true } },
      },
    }),
    organizationHasMarketIqAccess(organizationId, activeMarket.id),
  ]);
  if (!composer) notFound();
  const current = applyMarketIqReportScope(composer.preview.snapshot, composer.initialSelection);
  const prior = composer.priorEdition ? { ...composer.priorEdition, snapshot: applyMarketIqReportScope(composer.priorEdition.snapshot, composer.initialSelection) } : null;
  const comparison = compareMarketIqEditions(current, prior);
  const coverage = buildMarketIqCoveragePreflight(current);
  const workflow = buildMarketIqEditionWorkflow({ current, prior: prior?.snapshot ?? null, source: composer.preview.source, coverageCounts: coverage.counts, comparison });
  const savedSelection = preference ? marketIqSelectionFromPreference(preference) : composer.initialSelection;
  const enrollmentReadiness = buildEditionEnrollmentReadiness({
    hasCommercialAccess: organizationHasAccess,
    hasBrandProfile: Boolean(organizationSetup?.brandProfile),
    onboardingCompleted: Boolean(workspacePreference?.onboardingCompletedAt && preference?.configuredAt),
    hasSavedGeography: savedSelection.cities.length > 0 || savedSelection.zipCodes.length > 0,
    hasSavedSegment: savedSelection.segments.length > 0,
    sourceIsAuthoritative: composer.preview.source === "dwellsy_trends",
    sourceAvailableThrough: current.scope.periodEnd,
    hasPublishedBaseline: Boolean(composer.priorEdition),
    recurringEditionsEnabled: Boolean(preference?.recurringEditionsEnabled),
  });
  const latestSends = prior ? await prisma.marketIqReportSend.findMany({
    where: { organizationId, reportId: prior.id, deliveryStatus: { in: ["sent", "delivered"] } },
    orderBy: { createdAt: "desc" },
    select: { recipient: { select: { id: true, name: true, email: true, kind: true } }, deliveredAt: true, sentAt: true },
  }) : [];
  const priorAudience = [...new Map(latestSends.map((send) => [send.recipient.id, { ...send.recipient, deliveredAt: send.deliveredAt, sentAt: send.sentAt }])).values()];
  const priorAudienceIds = new Set(priorAudience.map((recipient) => recipient.id));
  const directoryOnly = recipients.filter((recipient) => !priorAudienceIds.has(recipient.id));
  const publishedCount = recentReports.filter((report) => report.status === "published").length;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Client reports</span></nav>
    <div className="mt-6"><MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath="/market-iq/editions" /></div>
    {query.activated === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Setup complete. Your first saved-scope client report is assembled below.</p>}
    {query.enrollment === "enabled" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Recurring drafts are on. Market IQ will prepare a private draft when the monthly rent data advances.</p>}
    {query.enrollment === "disabled" && <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">Recurring drafts are paused for this workspace. Existing reports and drafts were preserved.</p>}
    {query.refresh === "same_period" && <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">The reporting month has not changed, so no new draft was created.</p>}
    {query.refresh === "source_unavailable" && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">The latest rent data is temporarily unavailable. No draft was created.</p>}
    <header className="mt-6 grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Client reports</p><h1 className="dq-h1">Your published market reads and upcoming work</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">Open a published client link, continue a distribution draft, or prepare the next {activeMarket.shortLabel} report when new rent data is available.</p><Link href="/market-iq/get-started" className="mt-4 inline-block text-sm font-semibold text-teal-800">Edit brand and report defaults →</Link></div><aside className="rounded-xl bg-navy p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Next report</p><p className="mt-2 text-xl font-semibold">{workflow.state === "launch" ? "First report" : workflow.state === "new_period" ? "New data available" : "Current month"}</p><p className="mt-2 text-sm leading-6 text-white/70">Current cutoff: {dateLabel(workflow.currentPeriodEnd)}{workflow.priorPeriodEnd ? ` · Prior cutoff: ${dateLabel(workflow.priorPeriodEnd)}` : ""}</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rent values</p><p className="mt-3 text-3xl font-semibold text-navy">{coverage.counts.reportable}</p><p className="mt-1 text-xs text-slate-500">in your saved market scope</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Material changes</p><p className="mt-3 text-3xl font-semibold text-navy">{comparison.findings.length}</p><p className="mt-1 text-xs text-slate-500">since the prior report</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prior recipients</p><p className="mt-3 text-3xl font-semibold text-navy">{priorAudience.length}</p><p className="mt-1 text-xs text-slate-500">available for the next report</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Published reports</p><p className="mt-3 text-3xl font-semibold text-navy">{publishedCount}</p><p className="mt-1 text-xs text-slate-500">in recent report history</p></article></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-8"><div><p className="dq-eyebrow">Report library</p><h2 className="dq-h2">Published links and delivery progress</h2><p className="mt-2 text-sm leading-6 text-slate-600">Each published report is a permanent record. Distribution remains a separate, confirmed action.</p></div><Link href={`/market-iq/report?from=client-reports&market=${encodeURIComponent(activeMarket.id)}`} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Create client report</Link></div>
      {recurringDraft && <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-200 bg-orange-50 px-6 py-5 sm:px-8"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800">Private draft</p><p className="mt-1 text-sm font-semibold text-navy">{dateLabel(recurringDraft.periodEnd)} report ready for review</p><p className="mt-1 text-xs text-slate-600">{recurringDraft.materialChangeCount} material {recurringDraft.materialChangeCount === 1 ? "change" : "changes"} detected. No public link or email exists yet.</p></div><Link href={`/market-iq/review?market=${encodeURIComponent(activeMarket.id)}`} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Review draft</Link></div>}
      {recentReports.length ? <div className="divide-y divide-slate-100">{recentReports.map((report) => {
        const reportSnapshot = parseMarketIqReportSnapshot(report.snapshot);
        const campaign = report.distributionCampaigns[0] ?? null;
        const audience = reportSnapshot?.editorial?.audienceKind === "prospect" ? "Prospects" : "Current clients";
        return <article key={report.id} className="grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[1fr_190px_210px] lg:items-center"><div><div className="flex flex-wrap items-center gap-3"><p className="text-lg font-semibold text-navy">{activeMarket.shortLabel} market read</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${report.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{report.status}</span></div><p className="mt-2 text-sm text-slate-600">{report.periodLabel} · {audience}</p><p className="mt-2 text-xs text-slate-400">Published {dateLabel(report.publishedAt)} · {report.sends.length} confirmed {report.sends.length === 1 ? "send" : "sends"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Distribution</p><p className="mt-2 text-sm font-semibold capitalize text-navy">{campaign?.status ?? "Not staged"}</p><p className="mt-1 text-xs text-slate-500">{campaign?._count.recipients ?? 0} selected</p></div><div className="flex flex-wrap gap-2 lg:justify-end">{report.status === "published" && <><Link href={`/reports/market/${report.publicToken}`} target="_blank" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy">Open client page</Link>{campaign ? <Link href={campaign.status === "complete" || campaign.status === "partial" ? `/market-iq/delivery/${campaign.id}` : `/market-iq/published/${campaign.id}`} className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">{campaign.status === "complete" || campaign.status === "partial" ? "Open delivery receipt" : "Open report receipt"}</Link> : <Link href="/market-iq/sharing" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Prepare delivery</Link>}</>}</div></article>;
      })}</div> : <div className="px-6 py-10 text-center sm:px-8"><p className="text-lg font-semibold text-navy">No client reports yet</p><p className="mt-2 text-sm text-slate-500">Create the first report from the current {activeMarket.shortLabel} market read.</p></div>}
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 border-b border-slate-200 bg-slate-50 p-6 lg:grid-cols-[1fr_340px] lg:items-center">
        <div><p className="dq-eyebrow">Recurring report readiness</p><h2 className="dq-h2">{enrollmentReadiness.readyForScheduler ? "This workspace is enrolled" : enrollmentReadiness.prerequisitesPassed ? "Ready to enroll" : `${enrollmentReadiness.blockers.length} ${enrollmentReadiness.blockers.length === 1 ? "check needs" : "checks need"} attention`}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The scheduler checks daily and creates at most one private draft when authoritative Trends IQ advances. It cannot publish a report, select recipients, create a campaign, or send email.</p></div>
        <div className={`rounded-xl border p-5 ${enrollmentReadiness.readyForScheduler ? "border-emerald-200 bg-emerald-50" : enrollmentReadiness.prerequisitesPassed ? "border-teal-200 bg-teal-50" : "border-amber-200 bg-amber-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Enrollment</p><p className="mt-2 text-xl font-semibold text-navy">{enrollmentReadiness.enrolled ? "Recurring drafts on" : "Recurring drafts off"}</p>{enrollmentReadiness.prerequisitesPassed ? <form action={setMarketIqRecurringEnrollment} className="mt-4"><input type="hidden" name="marketId" value={activeMarket.id} /><input type="hidden" name="enabled" value={enrollmentReadiness.enrolled ? "false" : "true"} /><button className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold ${enrollmentReadiness.enrolled ? "border border-slate-300 bg-white text-navy" : "bg-navy text-white"}`}>{enrollmentReadiness.enrolled ? "Pause recurring drafts" : "Enable recurring drafts"}</button></form> : <p className="mt-3 text-xs leading-5 text-slate-600">Configure {activeMarket.shortLabel} and resolve the failed checks below before enrollment can be enabled.</p>}</div>
      </div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">{enrollmentReadiness.checks.map((check) => <article key={check.id} className="bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-navy">{check.label}</p><p className="mt-2 text-xs leading-5 text-slate-500">{check.detail}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${check.passed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{check.passed ? "Passed" : "Required"}</span></div>{check.remedyHref && <Link href={check.remedyHref} className="mt-3 inline-block text-xs font-semibold text-teal-800">{check.remedyLabel} →</Link>}</article>)}</div>
    </section>

    <section className="mt-8 grid gap-7 xl:grid-cols-[1fr_380px]">
      <div className="space-y-7">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Change review</p><h2 className="dq-h2">{comparison.heading}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{comparison.narrative}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${comparison.state === "changed" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{comparison.state}</span></div>{comparison.findings.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{comparison.findings.map((finding) => <article key={finding.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-wider text-orange-700">{finding.importance} priority</span><span className="text-[10px] uppercase text-slate-400">{finding.geographyType}</span></div><p className="mt-2 text-sm font-semibold leading-5 text-navy">{finding.headline}</p><p className="mt-2 text-xs leading-5 text-slate-500">{finding.detail}</p></article>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No materiality threshold was crossed. You can still publish a dated report if your regular client cadence calls for one.</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Audience carry-forward</p><h2 className="dq-h2">Who received the prior report</h2><p className="mt-2 text-sm leading-6 text-slate-600">This is planning context only. Publishing a report will not email anyone.</p>{priorAudience.length ? <div className="mt-5 divide-y divide-slate-100">{priorAudience.map((recipient) => <article key={recipient.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-navy">{recipient.name}</p><p className="mt-1 text-xs text-slate-500">{recipient.email} · {recipient.kind}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">Consider for next report</span></article>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">The prior report has no recorded audience. Add recipients after publishing the baseline.</p>}{directoryOnly.length > 0 && <p className="mt-4 text-xs leading-5 text-slate-500">{directoryOnly.length} additional saved {directoryOnly.length === 1 ? "recipient is" : "recipients are"} available in the recipient directory.</p>}</section>
      </div>

      <aside className="space-y-6">
        {latestOrchestration && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Scheduler health</p><div className="mt-2 flex items-center justify-between gap-3"><h2 className="dq-h2">Last source check</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{latestOrchestration.status}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{latestOrchestration.detail}</p><p className="mt-3 text-xs text-slate-400">{dateLabel(latestOrchestration.createdAt)}{latestOrchestration.run.sourceAvailableThrough ? ` · source through ${dateLabel(latestOrchestration.run.sourceAvailableThrough)}` : ""}{latestOrchestration.run.dryRun ? " · dry run" : ""}</p></section>}
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="dq-eyebrow">Next report</p><h2 className="dq-h2">{recurringDraft ? "A private draft is ready" : "Check for new data"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{recurringDraft ? `The ${dateLabel(recurringDraft.periodEnd)} draft contains ${recurringDraft.materialChangeCount} material ${recurringDraft.materialChangeCount === 1 ? "change" : "changes"}.` : "A new private draft is created only when the reporting month advances."}</p>{recurringDraft ? <Link href={`/market-iq/review?market=${encodeURIComponent(activeMarket.id)}`} className="mt-5 block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white">Review draft</Link> : <form action={checkForRecurringMarketIqEdition}><input type="hidden" name="marketId" value={activeMarket.id} /><button className="mt-5 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Check for new data</button></form>}<p className="mt-3 text-xs leading-5 text-slate-500">This check does not publish a report or send email.</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Readiness</p><h2 className="dq-h2">Publication checks</h2><div className="mt-5 space-y-3">{workflow.checks.map((check) => <article key={check.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-navy">{check.label}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ring-1 ${STATUS_STYLE[check.status]}`}>{check.status}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{check.detail}</p></article>)}</div>{workflow.canPrepare ? <Link href={`/market-iq/report?edition=next&market=${encodeURIComponent(activeMarket.id)}`} className="mt-6 block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white">Open review and publish controls</Link> : <p className="mt-6 rounded-md bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">Resolve blocked checks before preparing a client report.</p>}<p className="mt-3 text-xs leading-5 text-slate-500">Opening the controls does not publish or send anything. Publication freezes the reviewed evidence into a new link.</p></section>
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">After publication</p><p className="mt-2 text-lg font-semibold text-navy">Choose the audience</p><p className="mt-2 text-sm leading-6 text-slate-600">Sharing shows the published report, delivery drafts, and delivery history in one place.</p><Link href="/market-iq/sharing" className="mt-4 inline-block text-sm font-semibold text-teal-800">Open sharing →</Link></section>
      </aside>
    </section>
  </main>;
}
