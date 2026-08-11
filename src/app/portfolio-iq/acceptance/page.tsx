import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { prisma } from "@/lib/prisma";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadLaunchBriefing } from "@/lib/portfolio-iq/launch-briefing.server";
import { pilotAcceptanceProgress, pilotReviewKey, pilotSupportLabel } from "@/lib/portfolio-iq/pilot-acceptance";
import { finalizePilotAcceptance, recordPilotAcceptanceReview } from "./actions";

export const dynamic = "force-dynamic";

function responseLabel(value: string | undefined): string {
  return ({ confirmed: "Confirmed", useful: "Useful", investigate: "Investigate", incorrect: "Correction sent", acted: "Already acted" } as Record<string, string>)[value ?? ""] ?? "Not reviewed";
}

function responseTone(value: string | undefined): string {
  if (value === "incorrect") return "border-amber-200 bg-amber-50 text-amber-900";
  if (value) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-grid bg-surface-soft text-muted-foreground";
}

function supportTone(value: ReturnType<typeof pilotSupportLabel>): string {
  if (value === "Full support") return "bg-emerald-50 text-emerald-800";
  if (value === "Market context") return "bg-blue-50 text-blue-800";
  return "bg-amber-50 text-amber-900";
}

function ReviewStatus({ value }: { value: string | undefined }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em] ${responseTone(value)}`}>{responseLabel(value)}</span>;
}

function CorrectionForm({ portfolioId, objectType, objectId, label }: { portfolioId: string; objectType: "property" | "operator" | "finding"; objectId: string; label: string }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-grid px-3 py-2 text-xs font-semibold text-muted-foreground marker:content-none hover:bg-surface-soft">Report correction</summary>
      <form action={recordPilotAcceptanceReview} className="absolute right-0 top-full z-20 mt-2 w-[320px] max-w-[calc(100vw-3rem)] rounded-lg border border-grid bg-white p-4 shadow-xl">
        <input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="objectType" value={objectType} /><input type="hidden" name="objectId" value={objectId} /><input type="hidden" name="response" value="incorrect" />
        <label className="text-xs font-semibold text-navy">What should Dwellsy correct?<textarea name="note" required rows={3} placeholder={label} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal leading-5" /></label>
        <button className="mt-3 w-full rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Send to launch team</button>
      </form>
    </details>
  );
}

export default async function PilotAcceptancePage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const briefing = await loadLaunchBriefing({ userId, organizationId });
  if (!briefing) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, briefing.snapshot.portfolio.marketId)) notFound();

  const [acceptance, reviews] = await Promise.all([
    prisma.portfolioIqPilotAcceptance.findUnique({ where: { portfolioId: briefing.snapshot.portfolio.id } }),
    prisma.portfolioIqPilotReview.findMany({ where: { portfolioId: briefing.snapshot.portfolio.id }, orderBy: { reviewedAt: "desc" } }),
  ]);
  const reviewMap = new Map(reviews.map((review) => [pilotReviewKey(review.objectType, review.objectId), review]));
  const progress = pilotAcceptanceProgress({
    assetIds: briefing.snapshot.assets.map((asset) => asset.id),
    findingIds: briefing.snapshot.decisions.map((decision) => decision.signalId),
    reviews,
    accepted: acceptance?.status === "accepted",
  });
  const accepted = acceptance?.status === "accepted";

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />
      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
        <div><p className="dq-eyebrow">Guided launch session</p><h1 className="dq-h1">Confirm, react, and launch</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">Your onboarding specialist guides this review. Confirm what Dwellsy matched, react to the first findings, and leave the meeting with monitoring already running.</p></div>
        <aside className={`rounded-xl border p-5 ${accepted ? "border-emerald-200 bg-emerald-50" : "border-teal/25 bg-teal-soft"}`}><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Session progress</p><span className="text-xs font-semibold text-navy">{progress.completed}/{progress.total}</span></div><p className="mt-2 text-3xl font-semibold text-navy">{accepted ? "Launched" : `${progress.percent}%`}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-teal-700" style={{ width: `${progress.percent}%` }} /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{progress.correctionCount ? `${progress.correctionCount} correction ${progress.correctionCount === 1 ? "is" : "are"} already in Dwellsy's launch queue.` : "No corrections have been requested."}</p></aside>
      </header>

      {accepted && <section className="mt-7 flex flex-wrap items-center justify-between gap-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Acceptance complete</p><h2 className="mt-1 text-xl font-semibold text-navy">The launch baseline is active</h2><p className="mt-1 text-sm text-emerald-900/75">Weekly briefings and property watchlists are enabled. Open corrections remain with Dwellsy&apos;s launch team.</p></div><Link href="/today" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open Today →</Link></section>}

      <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="dq-eyebrow">Step 1</p><h2 className="dq-h2">Confirm the portfolio and operators</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">You only need to confirm what looks right or describe an exception. Dwellsy handles the correction work after the call.</p></div><span className="text-xs font-semibold text-muted-foreground">{briefing.snapshot.assets.length} properties</span></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">{briefing.snapshot.assets.map((asset) => {
          const propertyReview = reviewMap.get(pilotReviewKey("property", asset.id));
          const operatorReview = reviewMap.get(pilotReviewKey("operator", asset.id));
          const support = pilotSupportLabel(asset);
          return <article key={asset.id} className="rounded-xl border border-grid bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-teal-700">{asset.location}</p><h3 className="mt-1 text-lg font-semibold text-navy">{asset.name}</h3><p className="mt-1 text-xs text-muted-foreground">{asset.product} · {asset.buildings} {asset.buildings === 1 ? "building" : "buildings"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${supportTone(support)}`}>{support}</span></div>
            <div className="mt-5 border-t border-grid pt-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Property identity</p><ReviewStatus value={propertyReview?.response} /></div><div className="mt-3 flex flex-wrap gap-2"><form action={recordPilotAcceptanceReview}><input type="hidden" name="portfolioId" value={briefing.snapshot.portfolio.id} /><input type="hidden" name="objectType" value="property" /><input type="hidden" name="objectId" value={asset.id} /><input type="hidden" name="response" value="confirmed" /><button className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Looks right</button></form><CorrectionForm portfolioId={briefing.snapshot.portfolio.id} objectType="property" objectId={asset.id} label="Correct the property name, address, type, or building lineup." /></div></div>
            <div className="mt-4 border-t border-grid pt-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Observed operator</p><p className="mt-1 text-sm font-semibold text-navy">{asset.observedOperatorName ?? "Still being resolved"}</p></div><ReviewStatus value={operatorReview?.response} /></div><div className="mt-3 flex flex-wrap gap-2"><form action={recordPilotAcceptanceReview}><input type="hidden" name="portfolioId" value={briefing.snapshot.portfolio.id} /><input type="hidden" name="objectType" value="operator" /><input type="hidden" name="objectId" value={asset.id} /><input type="hidden" name="response" value="confirmed" /><button className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Operator is correct</button></form><CorrectionForm portfolioId={briefing.snapshot.portfolio.id} objectType="operator" objectId={asset.id} label="Tell us the current property manager or what is incorrect." /></div></div>
          </article>;
        })}</div>
      </section>

      <section className="mt-12"><p className="dq-eyebrow">Step 2</p><h2 className="dq-h2">React to the first findings</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These reactions help Dwellsy tune the briefing and distinguish an interesting observation from an issue that deserves action.</p>
        {briefing.snapshot.decisions.length ? <div className="mt-5 grid gap-4 lg:grid-cols-3">{briefing.snapshot.decisions.map((finding, index) => {
          const review = reviewMap.get(pilotReviewKey("finding", finding.signalId));
          return <article key={finding.signalId} className="rounded-xl border border-grid bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{index + 1}</span><ReviewStatus value={review?.response} /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-teal-700">{finding.assetName ?? "Portfolio"}</p><h3 className="mt-2 text-lg font-semibold leading-6 text-navy">{finding.headline}</h3><p className="mt-2 text-sm leading-6 text-foreground/75">{finding.narrative}</p><div className="mt-5 flex flex-wrap gap-2">{[["useful", "Useful"], ["investigate", "Investigate"], ["acted", "Already acted"]].map(([response, label]) => <form key={response} action={recordPilotAcceptanceReview}><input type="hidden" name="portfolioId" value={briefing.snapshot.portfolio.id} /><input type="hidden" name="objectType" value="finding" /><input type="hidden" name="objectId" value={finding.signalId} /><input type="hidden" name="response" value={response} /><button className="rounded-md border border-navy px-2.5 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">{label}</button></form>)}<CorrectionForm portfolioId={briefing.snapshot.portfolio.id} objectType="finding" objectId={finding.signalId} label="Tell us which evidence or conclusion is incorrect." /></div><Link href={`/today/cases/${finding.signalId}`} className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline">Review full evidence →</Link></article>;
        })}</div> : <div className="mt-5 rounded-xl border border-dashed border-grid p-8 text-center text-sm text-muted-foreground">No evidence-qualified findings are available yet. This does not block launch.</div>}
      </section>

      <section className={`mt-12 rounded-xl border p-6 ${accepted ? "border-emerald-200 bg-emerald-50" : "border-navy bg-navy text-white"}`}><div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-center"><div><p className={`text-[10px] font-bold uppercase tracking-[0.13em] ${accepted ? "text-emerald-800" : "text-teal-200"}`}>Step 3 · Launch</p><h2 className={`mt-2 text-2xl font-semibold ${accepted ? "text-navy" : "text-white"}`}>{accepted ? "Portfolio monitoring is active" : "Approve the starting position"}</h2><p className={`mt-2 max-w-3xl text-sm leading-6 ${accepted ? "text-emerald-900/75" : "text-white/75"}`}>{accepted ? "The owner watchlist, weekly briefing, and monitoring baseline were activated together." : "Approval locks the evidence shown today, enables weekly briefings, and adds every property to the owner watchlist. Open corrections remain clearly labeled and do not become unsupported conclusions."}</p></div>{accepted ? <Link href="/today" className="rounded-md bg-navy px-5 py-3 text-center text-sm font-semibold text-white">Continue to Today →</Link> : <form action={finalizePilotAcceptance} className="space-y-3"><input type="hidden" name="portfolioId" value={briefing.snapshot.portfolio.id} /><textarea name="note" rows={2} placeholder="Optional launch-call notes" className="w-full rounded-md border border-white/25 bg-white px-3 py-2 text-sm text-navy placeholder:text-muted-foreground" /><button className="w-full rounded-md bg-white px-5 py-3 text-sm font-semibold text-navy">Approve and launch portfolio</button></form>}</div></section>
    </main>
  );
}
