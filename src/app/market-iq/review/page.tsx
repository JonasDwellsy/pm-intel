import { notFound, redirect } from "next/navigation";
import { MarketIqWorkspaceNav } from "@/components/market-iq/MarketIqWorkspaceNav";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import type { MarketIqEditionComparison } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";
import { beginMarketIqDraftReview, dismissMarketIqDraft, retryMarketIqEditionCheck } from "@/app/market-iq/review/actions";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not available";
}

function dateTimeLabel(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "Not available";
}

function comparison(value: string): MarketIqEditionComparison | null {
  try {
    const parsed = JSON.parse(value) as MarketIqEditionComparison;
    return parsed && Array.isArray(parsed.findings) ? parsed : null;
  } catch {
    return null;
  }
}

const CHECK_MESSAGES: Record<string, string> = {
  draft_created: "A new private draft was created and added to the review queue.",
  draft_exists: "The current Trends IQ period is already represented in the review queue.",
  same_period: "The source check completed. Trends IQ has not advanced beyond the latest published edition.",
  source_unavailable: "Authoritative Trends IQ is unavailable. No draft was created from fallback data.",
  baseline_required: "A reviewed baseline must be published before recurring drafts can be created.",
  blocked: "The source check completed, but the saved scope did not pass the edition-readiness checks.",
};

export default async function MarketIqReviewInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; draft?: string; draftId?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, query] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    searchParams,
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace?from=/market-iq/review");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  if (!access.capabilities.useRecurringEditions) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const [drafts, recentDecisions, orchestrationItems, preference] = await Promise.all([
    prisma.marketIqEditionDraft.findMany({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID, status: { in: ["ready", "reviewing"] } },
      orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
      select: {
        id: true,
        periodEnd: true,
        status: true,
        sourceAvailableThrough: true,
        materialChangeCount: true,
        comparison: true,
        detectedAt: true,
        reviewStartedAt: true,
      },
    }),
    prisma.marketIqEditionDraft.findMany({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID, status: { in: ["published", "dismissed"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, periodEnd: true, status: true, reviewedAt: true, dismissedAt: true, dismissalReason: true, publishedReportId: true },
    }),
    prisma.marketIqEditionOrchestrationItem.findMany({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        detail: true,
        periodEnd: true,
        createdAt: true,
        run: { select: { triggerKind: true, dryRun: true, status: true, sourceAvailableThrough: true } },
      },
    }),
    prisma.marketIqWorkspacePreference.findUnique({
      where: { organizationId },
      select: { recurringEditionsEnabled: true },
    }),
  ]);

  const readyCount = drafts.filter((draft) => draft.status === "ready").length;
  const reviewingCount = drafts.filter((draft) => draft.status === "reviewing").length;
  const exceptionCount = orchestrationItems.filter((item) => ["blocked", "failed"].includes(item.status)).length;
  const latestSource = orchestrationItems.find((item) => item.run.sourceAvailableThrough)?.run.sourceAvailableThrough ?? drafts[0]?.sourceAvailableThrough ?? null;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <MarketIqWorkspaceNav />
    {query.draft === "dismissed" && <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">The draft was dismissed and preserved in the decision history. Nothing was published or sent.</p>}
    {query.check && CHECK_MESSAGES[query.check] && <p className={`mb-6 rounded-xl border px-5 py-3 text-sm font-semibold ${["source_unavailable", "blocked", "baseline_required"].includes(query.check) ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{CHECK_MESSAGES[query.check]}</p>}

    <header className="grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_380px] lg:items-end">
      <div><p className="dq-eyebrow">PM review inbox</p><h1 className="dq-h1">Decide what becomes the next client edition</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Private drafts arrive here when authoritative Trends IQ advances. Review the evidence, continue editorial work, or record why an edition should not move forward.</p></div>
      <aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Safety boundary</p><p className="mt-3 text-xl font-semibold">Review only</p><p className="mt-2 text-sm leading-6 text-white/70">This inbox cannot publish a report, select recipients, create a campaign, or send email. Those decisions remain separate and explicit.</p></aside>
    </header>

    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-xl border border-orange-200 bg-orange-50 p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Awaiting review</p><p className="mt-3 text-3xl font-semibold text-navy">{readyCount}</p><p className="mt-1 text-xs text-slate-600">new private {readyCount === 1 ? "draft" : "drafts"}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">In review</p><p className="mt-3 text-3xl font-semibold text-navy">{reviewingCount}</p><p className="mt-1 text-xs text-slate-500">started but not published</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Source available through</p><p className="mt-3 text-xl font-semibold text-navy">{dateLabel(latestSource)}</p><p className="mt-1 text-xs text-slate-500">latest orchestration evidence</p></article>
      <article className={`rounded-xl border p-5 ${exceptionCount ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent exceptions</p><p className="mt-3 text-3xl font-semibold text-navy">{exceptionCount}</p><p className="mt-1 text-xs text-slate-600">blocked or failed source checks</p></article>
    </section>

    <section className="mt-8 grid gap-7 xl:grid-cols-[1fr_390px]">
      <div className="space-y-6">
        <div><p className="dq-eyebrow">Attention queue</p><h2 className="dq-h2">{drafts.length ? `${drafts.length} ${drafts.length === 1 ? "edition needs" : "editions need"} a PM decision` : "The queue is clear"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">The queue contains only private, authoritative drafts. Opening one begins review but does not make it public.</p></div>
        {drafts.length ? drafts.map((draft) => {
          const change = comparison(draft.comparison);
          const findings = change?.findings.slice(0, 3) ?? [];
          return <article key={draft.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${draft.status === "ready" ? "border-orange-200" : "border-teal-200"}`}>
            <div className={`flex flex-wrap items-start justify-between gap-4 border-b p-6 ${draft.status === "ready" ? "border-orange-100 bg-orange-50/60" : "border-teal-100 bg-teal-50/60"}`}><div><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${draft.status === "ready" ? "bg-orange-100 text-orange-800" : "bg-teal-100 text-teal-800"}`}>{draft.status === "ready" ? "New" : "In review"}</span><span className="text-xs font-semibold text-slate-400">Cleveland local market read</span></div><h3 className="mt-3 text-2xl font-semibold text-navy">Edition through {dateLabel(draft.periodEnd)}</h3><p className="mt-2 text-sm text-slate-600">{change?.heading ?? `${draft.materialChangeCount} material changes require review.`}</p></div><div className="text-right"><p className="text-3xl font-semibold text-navy">{draft.materialChangeCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">material changes</p></div></div>
            <div className="p-6">{findings.length ? <div className="grid gap-3 md:grid-cols-3">{findings.map((finding) => <div key={finding.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-orange-700">{finding.importance} priority · {finding.geographyType}</p><p className="mt-2 text-sm font-semibold leading-5 text-navy">{finding.headline}</p></div>)}</div> : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No material threshold was crossed. Review whether the regular client cadence still calls for an edition.</div>}
              <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><p className="text-xs leading-5 text-slate-500">Detected {dateTimeLabel(draft.detectedAt)}{draft.reviewStartedAt ? ` · Review started ${dateTimeLabel(draft.reviewStartedAt)}` : ""}<br />Source available through {dateLabel(draft.sourceAvailableThrough)}</p><div className="flex flex-wrap gap-2"><form action={dismissMarketIqDraft} className="flex items-center gap-2"><input type="hidden" name="draftId" value={draft.id} /><label className="sr-only" htmlFor={`reason-${draft.id}`}>Dismissal reason</label><select id={`reason-${draft.id}`} name="reason" required defaultValue="" className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="" disabled>Dismiss because…</option><option value="No material client-relevant change">No client-relevant change</option><option value="Hold for the next reporting period">Hold for next period</option><option value="Source evidence needs follow-up">Evidence needs follow-up</option></select><button className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-navy">Dismiss</button></form><form action={beginMarketIqDraftReview}><input type="hidden" name="draftId" value={draft.id} /><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">{draft.status === "ready" ? "Start review" : "Continue review"}</button></form></div></div>
            </div>
          </article>;
        }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><p className="text-lg font-semibold text-navy">No private draft needs attention</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">When authoritative Trends IQ advances and the recurring engine creates a draft, it will appear here before any public or recipient-facing step.</p></div>}
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="dq-eyebrow">Source check</p><h2 className="dq-h2">{preference?.recurringEditionsEnabled ? "Recurring drafts are on" : "Recurring drafts are paused"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Run the same safe, organization-scoped check used by the scheduler. It can only create or find a private draft.</p><form action={retryMarketIqEditionCheck}><button className="mt-5 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Check authoritative source now</button></form><p className="mt-3 text-xs leading-5 text-slate-500">Safe to retry. No report is published and no email is sent.</p></section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-6"><p className="dq-eyebrow">Automation history</p><h2 className="dq-h2">Recent source checks</h2></div>{orchestrationItems.length ? <div className="divide-y divide-slate-100">{orchestrationItems.map((item) => <article key={item.id} className="p-5"><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${["created", "existing", "would_create"].includes(item.status) ? "bg-emerald-50 text-emerald-800" : ["blocked", "failed"].includes(item.status) ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{item.status.replace("_", " ")}</span><span className="text-[10px] text-slate-400">{dateTimeLabel(item.createdAt)}</span></div><p className="mt-3 text-xs leading-5 text-slate-600">{item.detail}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">{item.run.triggerKind}{item.run.dryRun ? " · dry run" : ""}{item.periodEnd ? ` · period ${item.periodEnd}` : ""}</p></article>)}</div> : <p className="p-6 text-sm leading-6 text-slate-600">No scheduled or manual source checks have been recorded for this workspace yet.</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Decision history</p><h2 className="dq-h2">Recently resolved</h2>{recentDecisions.length ? <div className="mt-4 divide-y divide-slate-100">{recentDecisions.map((decision) => <div key={decision.id} className="py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-navy">Through {dateLabel(decision.periodEnd)}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${decision.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{decision.status}</span></div>{decision.dismissalReason && <p className="mt-2 text-xs leading-5 text-slate-500">{decision.dismissalReason}</p>}<p className="mt-1 text-[10px] text-slate-400">{dateLabel(decision.dismissedAt ?? decision.reviewedAt)}</p></div>)}</div> : <p className="mt-4 text-sm leading-6 text-slate-600">Published and dismissed draft decisions will appear here.</p>}</section>
      </aside>
    </section>
  </main>;
}
