import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MarketIqCompetitiveSetBrief } from "@/components/market-iq/report/MarketIqCompetitiveSetBrief";
import { getMarketIqMarket } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { buildMarketIqCompetitiveSetBrief } from "@/lib/market-iq/competitive-set-brief";
import { loadMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-editions.server";
import { loadMarketIqCompetitiveSetWatchlist } from "@/lib/market-iq/daily-watchlists.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: { absolute: "Competitive Set Brief | Market IQ | Dwellsy IQ" },
};

export default async function MarketIqCompetitiveSetBriefPage({ params }: {
  params: Promise<{ watchlistId: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ watchlistId }, context, access] = await Promise.all([
    params,
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!context.userId) notFound();
  if (!context.organizationId) redirect("/setup-workspace");
  if (!access.hasProduct) redirect("/market-iq/subscribe");

  const watchlist = await loadMarketIqCompetitiveSetWatchlist({
    organizationId: context.organizationId,
    userId: context.userId,
    watchlistId,
  });
  if (!watchlist || !isMarketEntitled(access.entitlement, watchlist.marketId)) notFound();
  const market = getMarketIqMarket(watchlist.marketId);
  if (!market || market.status !== "live") notFound();

  const archive = await loadMarketIqDailyEditionArchive({
    marketId: market.id,
    timeZone: market.timeZone,
    recentLimit: 16,
  });
  const brief = buildMarketIqCompetitiveSetBrief({ watchlist, editions: archive.recent });

  return <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    {brief.state === "available" ? <MarketIqCompetitiveSetBrief brief={brief} marketName={market.shortLabel} timeZone={market.timeZone} /> : <>
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href={`/market-iq/daily?market=${encodeURIComponent(market.id)}`} className="hover:text-teal-700">Daily Edition</Link><span>/</span><span>Competitive sets</span><span>/</span><span className="text-navy">{watchlist.name}</span></nav>
      <section className="rounded-3xl border border-amber-200 bg-amber-50 px-7 py-10" aria-label="Competitive set evidence unavailable"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Competitive set brief</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy">No events were observed for the available period.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">A persisted Daily Edition with available listing activity could not be read for this market. No monthly trend, reconstructed event, or example content has been substituted.{brief.attemptedAt ? ` The most recent read was attempted ${new Date(brief.attemptedAt).toLocaleString("en-US", { timeZone: market.timeZone, timeZoneName: "short" })}.` : ""}</p></section>
    </>}
  </main>;
}
