import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadOwnerWatchActivity } from "@/lib/portfolio-iq/owner-watch-activity.server";
import type { OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";
import { markOwnerWatchActivityReviewed } from "./actions";

export const dynamic = "force-dynamic";

function eventLabel(kind: OwnerWatchActivityEvent["kind"]): string {
  return { evidence: "New evidence", decision: "Decision activity", outcome: "Outcome review", source: "Source health" }[kind];
}

function ActivityCard({ event }: { event: OwnerWatchActivityEvent & { isNew: boolean } }) {
  return <article className={event.isNew ? "rounded-xl border border-teal/35 bg-teal-soft p-5 sm:p-6" : "rounded-xl border border-grid bg-white p-5 sm:p-6"}>
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="text-teal-700">{eventLabel(event.kind)}</span>{event.isNew && <span className="rounded-full bg-navy px-2 py-1 text-white">New</span>}<time className="ml-auto text-muted-foreground">{event.occurredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></div>
    <h3 className="mt-3 text-lg font-semibold leading-6 text-navy">{event.headline}</h3><p className="mt-2 text-sm leading-6 text-foreground/75">{event.detail}</p>
    <div className="mt-3 flex flex-wrap gap-2">{event.objects.map((object) => <span key={`${object.objectType}:${object.objectKey}`} className="rounded-full border border-grid bg-white px-2.5 py-1 text-[11px] text-muted-foreground">{object.label}</span>)}</div>
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-grid pt-4"><Link href={event.href} className="rounded-md border border-grid bg-white px-3 py-2 text-xs font-semibold text-navy">Open evidence</Link>{event.isNew && <form action={markOwnerWatchActivityReviewed}><input type="hidden" name="eventId" value={event.id} /><button className="rounded-md px-3 py-2 text-xs font-semibold text-teal-800">Mark reviewed</button></form>}</div>
  </article>;
}

export default async function OwnerWatchActivityPage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const [data, entitlement] = await Promise.all([loadOwnerWatchActivity({ userId, organizationId }), resolveViewerEntitlement()]);
  if (!data || !isMarketEntitled(entitlement, data.portfolio.marketId)) notFound();
  const { activity } = data;
  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10"><DwellsyIqWorkspaceNav />
    <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Owner Watchlist activity</p><h1 className="dq-h1">Since your last review</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">One personal change ledger across watched markets, properties, operators, and decisions. Reviewing an item changes only your unread state.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/portfolio-iq/watchlists" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy">Manage Watchlist</Link>{activity.newEvents.length > 0 && <form action={markOwnerWatchActivityReviewed}><input type="hidden" name="eventId" value="all" /><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Mark all reviewed</button></form>}</div></div><aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Your unread activity</p><p className="mt-2 text-3xl font-semibold text-navy">{activity.newEvents.length}</p><p className="mt-1 text-xs leading-5 text-foreground/70">{activity.isFocused ? "Filtered to shared Watchlist pins" : "Full portfolio monitoring until items are pinned"}</p></aside></header>
    <section className="mt-9"><div className="flex items-end justify-between gap-4"><div><p className="dq-eyebrow">Requires review</p><h2 className="dq-h2">What changed</h2></div></div>{activity.newEvents.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{activity.newEvents.map((event) => <ActivityCard key={event.id} event={event} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-grid bg-white p-7"><h3 className="font-semibold text-navy">You are caught up</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">No new watched evidence, decisions, outcomes, or material source-health changes have appeared since your review.</p></div>}</section>
    {activity.priorEvents.length > 0 && <section className="mt-10 border-t border-grid pt-8"><p className="dq-eyebrow">Previously reviewed</p><h2 className="dq-h2">Recent activity</h2><div className="mt-5 grid gap-4 lg:grid-cols-2">{activity.priorEvents.slice(0, 12).map((event) => <ActivityCard key={event.id} event={event} />)}</div></section>}
  </main>;
}
