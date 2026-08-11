import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadOwnerWatchlist } from "@/lib/portfolio-iq/owner-watchlist.server";
import type { OwnerWatchCandidate } from "@/lib/portfolio-iq/owner-watchlist";
import { toggleOwnerWatchItem } from "./actions";

export const dynamic = "force-dynamic";

type DecoratedItem = OwnerWatchCandidate & { pinned: boolean };

function WatchCard({ item }: { item: DecoratedItem }) {
  return <article className={item.pinned ? "rounded-xl border border-teal/35 bg-teal-soft p-5" : "rounded-xl border border-grid bg-white p-5"}>
    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{item.source}</p><h3 className="mt-2 text-base font-semibold leading-6 text-navy">{item.label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy">{item.signalCount} {item.signalCount === 1 ? "signal" : "signals"}</span></div>
    <div className="mt-4 flex items-center gap-2 border-t border-grid pt-4"><Link href={item.href} className="rounded-md border border-grid bg-white px-3 py-2 text-xs font-semibold text-navy">Open</Link><form action={toggleOwnerWatchItem}><input type="hidden" name="objectType" value={item.objectType} /><input type="hidden" name="objectKey" value={item.objectKey} /><input type="hidden" name="mode" value={item.pinned ? "unpin" : "pin"} /><button className={item.pinned ? "rounded-md px-3 py-2 text-xs font-semibold text-teal-800" : "rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white"}>{item.pinned ? "Remove pin" : "Pin to watch"}</button></form></div>
  </article>;
}

function WatchSection({ eyebrow, title, description, items }: { eyebrow: string; title: string; description: string; items: DecoratedItem[] }) {
  return <section className="mt-10 border-t border-grid pt-8"><div className="grid gap-2 lg:grid-cols-[280px_1fr]"><div><p className="dq-eyebrow">{eyebrow}</p><h2 className="dq-h2">{title}</h2></div><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <WatchCard key={`${item.objectType}:${item.objectKey}`} item={item} />)}</div></section>;
}

export default async function OwnerWatchlistsPage() {
  if (!portfolioIqPreviewEnabled() || !(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const [data, entitlement] = await Promise.all([loadOwnerWatchlist({ userId, organizationId }), resolveViewerEntitlement()]);
  if (!data || !isMarketEntitled(entitlement, data.portfolio.marketId)) notFound();
  const { groups } = data;
  const sourceLabel = data.sourceImports.length ? data.sourceImports.map((source) => source.sourceKind.replaceAll("_", " ")).join(" · ") : "Source setup in progress";
  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10"><DwellsyIqWorkspaceNav />
    <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_380px] lg:items-end"><div><p className="dq-eyebrow">Connected monitoring</p><h1 className="dq-h1">Owner Watchlist</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">Keep the markets, properties, operators, and decisions that matter in one shared owner view. Pinning changes attention, not source data or Operator IQ scorecards.</p></div><aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Monitoring health</p><p className="mt-2 text-lg font-semibold text-navy">{data.latestRun?.sourceHealth ?? "Historical baseline"}</p><p className="mt-1 text-xs leading-5 text-foreground/70">{sourceLabel}</p></aside></header>
    <section className="mt-8 rounded-xl border border-grid bg-surface-soft p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="dq-eyebrow">Pinned attention</p><h2 className="dq-h2">Your shared focus</h2></div><span className="rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">{groups.pinned.length} pinned</span></div>{groups.pinned.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.pinned.map((item) => <WatchCard key={`${item.objectType}:${item.objectKey}`} item={item} />)}</div> : <p className="mt-5 rounded-lg border border-dashed border-grid bg-white p-6 text-sm leading-6 text-muted-foreground">Nothing is pinned yet. The full portfolio is still monitored automatically. Pin the few objects your team wants to keep at the top of this view.</p>}</section>
    <WatchSection eyebrow="Portfolio lens" title="Properties" description="Every owned property remains monitored. Pin assets that deserve persistent attention across market, comp, and operator changes." items={groups.properties} />
    <WatchSection eyebrow="Market lens" title="Cities and ZIPs" description="Local exposure is derived from the portfolio footprint, with city and ZIP scopes kept separate from MSA-level context." items={groups.geographies} />
    <WatchSection eyebrow="Operator lens" title="Observed operators" description="Lightweight operator context stays connected here. Detailed benchmarking and scorecards remain in Operator IQ." items={groups.operators} />
    <WatchSection eyebrow="Decision lens" title="Active decisions" description="Pin the cases that need continued owner attention. Their evidence, ownership, follow-up, and outcomes remain in the shared decision record." items={groups.decisions} />
  </main>;
}
