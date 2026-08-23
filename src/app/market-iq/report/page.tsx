import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarketIqDataUnavailable } from "@/components/market-iq/MarketIqDataUnavailable";
import { MarketIqReportHistory } from "@/components/market-iq/MarketIqReportHistory";
import { MarketIqReportComposerClient } from "@/components/market-iq/report/MarketIqReportComposerClient";
import { MarketIqLaunchJourney } from "@/components/market-iq/launch/MarketIqLaunchJourney";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { buildMarketIqCompetitiveSetBrief } from "@/lib/market-iq/competitive-set-brief";
import { buildMarketIqCompetitiveSetReportSection } from "@/lib/market-iq/competitive-set-report";
import { loadMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-editions.server";
import { loadMarketIqCompetitiveSetWatchlist } from "@/lib/market-iq/daily-watchlists.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";

export const dynamic = "force-dynamic";

export default async function MarketIqReportComposerPage({ searchParams }: { searchParams: Promise<{ published?: string; delivery?: string; activated?: string; draftId?: string; edition?: string; flow?: string; from?: string; market?: string; competitiveSetId?: string; event?: string | string[] }> }) {
  const previewEnabled = marketIqPreviewEnabled();
  if (!previewEnabled) notFound();
  const [{ userId, organizationId }, query] = await Promise.all([getActiveOrgContext(), searchParams]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const access = await resolveViewerMarketIqAccess();
  const preference = await prisma.marketIqWorkspacePreference.findUnique({
    where: { organizationId },
    select: { defaultMarketId: true },
  });
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: preference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket || !canAccessMarketIqReportComposer({ previewEnabled, userId, organizationId, hasProduct: access.hasProduct, marketEntitled: isMarketEntitled(access.entitlement, activeMarket.id) })) notFound();
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");
  let composer: Awaited<ReturnType<typeof loadMarketIqReportComposer>>;
  try {
    composer = await loadMarketIqReportComposer(organizationId, activeMarket.id);
  } catch (error) {
    console.error("[Market IQ] Edition review source unavailable", {
      marketId: activeMarket.id,
      error: error instanceof Error ? { name: error.name, code: "code" in error ? String(error.code) : undefined } : { name: "UnknownError" },
    });
    return <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground"><Link href={`/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&step=2`} className="hover:text-teal-700">Back to {activeMarket.shortLabel} setup</Link><span>/</span><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Edition review</span></nav>
      <MarketIqDataUnavailable
        title={`${activeMarket.shortLabel} market data unavailable`}
        detail="A verified saved Trends IQ report is not available for review. Market IQ kept your firm details and market scope, but it will not substitute another market or estimate missing rent values."
        primaryAction={{ href: `/market-iq/report?market=${encodeURIComponent(activeMarket.id)}&from=setup&activated=1&retry=1`, label: "Try again" }}
        secondaryAction={{ href: `/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&step=2`, label: "Return to setup" }}
      />
    </main>;
  }
  if (!composer) notFound();
  const draft = query.draftId ? await prisma.marketIqEditionDraft.findFirst({
    where: { id: query.draftId, organizationId, marketId: activeMarket.id, status: { in: ["ready", "reviewing"] } },
    select: { id: true, snapshot: true, periodEnd: true, materialChangeCount: true },
  }) : null;
  const draftSnapshot = draft ? parseMarketIqReportSnapshot(draft.snapshot) : null;
  const workingSnapshot = draftSnapshot ?? composer.preview.snapshot;
  const workingBrand = draftSnapshot?.brand ?? composer.brand;
  const marketPreference = await prisma.marketIqMarketPreference.findUnique({
    where: { organizationId_marketId: { organizationId, marketId: activeMarket.id } },
    select: { deliveryMode: true },
  });
  const competitiveWatchlist = query.competitiveSetId ? await loadMarketIqCompetitiveSetWatchlist({
    organizationId,
    userId,
    watchlistId: query.competitiveSetId,
  }) : null;
  const competitiveSetBrief = competitiveWatchlist?.marketId === activeMarket.id
    ? buildMarketIqCompetitiveSetBrief({
      watchlist: competitiveWatchlist,
      editions: (await loadMarketIqDailyEditionArchive({ marketId: activeMarket.id, timeZone: activeMarket.timeZone, recentLimit: 16 })).recent,
    })
    : null;
  const selectedCompetitiveEvents = Array.isArray(query.event) ? query.event : query.event ? [query.event] : [];
  const competitiveSetReportSection = competitiveSetBrief?.state === "available"
    ? buildMarketIqCompetitiveSetReportSection(competitiveSetBrief, selectedCompetitiveEvents)
    : null;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    {query.flow === "launch" && <MarketIqLaunchJourney current="edition" />}
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">{query.from === "setup" && <><Link href={`/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&step=2`} className="hover:text-teal-700">Back to {activeMarket.shortLabel} setup</Link><span>/</span></>}<Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><Link href={`/market-iq/editions?market=${encodeURIComponent(activeMarket.id)}`} className="hover:text-teal-700">Client reports</Link><span>/</span><span>Review and publish</span><span>·</span><Link href="/market-iq/distribution" className="hover:text-teal-700">Recipients</Link></nav>
    {query.activated === "1" && <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Setup saved. Review the current {activeMarket.shortLabel} edition below. It remains private until you publish it, and no email is sent from this page.</p>}
    {draft && <p className="mb-6 rounded-xl border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-900">Private recurring draft loaded for the Trends IQ period ending {draft.periodEnd}. It contains {draft.materialChangeCount} material {draft.materialChangeCount === 1 ? "change" : "changes"} and is not public or attached to an audience.</p>}
    <header className="border-b border-grid pb-8">
      <p className="dq-eyebrow">Client advisory</p><h1 className="dq-h1">Prepare a {activeMarket.shortLabel} local market read</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">Review the client report beside your controls, add an optional note from your firm, and choose whether future monthly editions run automatically or wait for your approval.</p>
    </header>

    {query.from === "competitive-set" && <p className={`mb-6 rounded-xl border px-5 py-3 text-sm font-semibold ${competitiveSetReportSection ? "border-violet-200 bg-violet-50 text-violet-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{competitiveSetReportSection ? `${competitiveSetReportSection.findings.length} observed competitive-set findings are included in this draft.` : "The selected competitive-set evidence is unavailable or no findings were selected. Nothing was substituted."}</p>}
    <MarketIqReportComposerClient snapshot={workingSnapshot} initialBrand={workingBrand} initialEditorialDefaults={composer.editorialDefaults} initialSelection={composer.initialSelection} source={draft ? "dwellsy_trends" : composer.preview.source} priorEdition={composer.priorEdition} initialDeliveryMode={marketPreference?.deliveryMode === "autopilot" ? "autopilot" : "review"} draftId={draft?.id ?? null} launchFlow={query.flow === "launch"} initialCompetitiveSetBrief={competitiveSetReportSection} />
    <section className="mt-8 max-w-xl"><MarketIqReportHistory reports={composer.organization.marketIqReports} highlightedId={query.published} delivery={query.delivery} /></section>
  </main>;
}
