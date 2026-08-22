import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import { MarketIqMarketPreparing } from "@/components/market-iq/MarketIqMarketPreparing";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { MarketIqDailyEditionArchive, MarketIqDailyEditionMissing } from "@/components/market-iq/report/MarketIqDailyEditionArchive";
import { MarketIqDailyEditionComparisonPanel } from "@/components/market-iq/report/MarketIqDailyEditionComparison";
import { MarketIqDailyEvents } from "@/components/market-iq/report/MarketIqDailyEvents";
import { MarketIqTimeToResolution } from "@/components/market-iq/report/MarketIqTimeToResolution";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { compareMarketIqDailyEditions } from "@/lib/market-iq/daily-edition-comparison";
import { loadMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-editions.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { MARKET_IQ_MARKET_INTELLIGENCE_ROUTES } from "@/lib/market-iq/navigation";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: { absolute: "Daily Edition | Market IQ | Dwellsy IQ" },
};

function dailyPath(input: { marketId?: string; editionId?: string }) {
  const params = new URLSearchParams();
  if (input.marketId) params.set("market", input.marketId);
  if (input.editionId) params.set("edition", input.editionId);
  const query = params.toString();
  return `${MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily}${query ? `?${query}` : ""}`;
}

export default async function MarketIqDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; edition?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();

  const [{ organizationId }, query] = await Promise.all([
    getActiveOrgContext(),
    searchParams,
  ]);
  if (!organizationId) {
    const returnTo = dailyPath({ marketId: query.market, editionId: query.edition });
    redirect(`/setup-workspace?from=${encodeURIComponent(returnTo)}`);
  }

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct) redirect("/market-iq/subscribe");

  const preference = await prisma.marketIqWorkspacePreference.findUnique({
    where: { organizationId },
    select: { onboardingCompletedAt: true, defaultMarketId: true },
  });
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: preference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket) redirect("/market-iq/subscribe");

  if (access.source === "subscription" && !preference?.onboardingCompletedAt) {
    const returnTo = dailyPath({ marketId: activeMarket.id, editionId: query.edition });
    redirect(`/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  if (activeMarket.status !== "live") {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath={MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily} />
        <MarketIqMarketPreparing market={activeMarket} />
      </main>
    );
  }

  const archive = await loadMarketIqDailyEditionArchive({
    marketId: activeMarket.id,
    requestedEditionId: query.edition,
    timeZone: activeMarket.timeZone,
  });
  if (!archive.latest) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath={MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily} />
        <MarketIqMarketPreparing market={activeMarket} state="source_unavailable" />
      </main>
    );
  }

  if (archive.requestedEditionMissing || !archive.current) {
    return (
      <main style={{ "--report-primary": "#17324a", "--report-accent": "#c16f36" } as CSSProperties} className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath={MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily} />
        <MarketIqDailyEditionMissing marketId={activeMarket.id} />
      </main>
    );
  }

  const report = archive.current.value;
  const comparison = compareMarketIqDailyEditions({
    current: report.marketActivity,
    previous: archive.previous
      ? { availability: archive.previous.value.marketActivity }
      : null,
  });

  return (
    <main style={{ "--report-primary": "#17324a", "--report-accent": "#c16f36" } as CSSProperties} className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath={MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily} />
      <MarketIqDailyEditionArchive
        marketId={activeMarket.id}
        current={archive.current}
        latest={archive.latest}
        previous={archive.previous}
        next={archive.next}
        recent={archive.recent}
        timeZone={activeMarket.timeZone}
      />
      <div className="mt-7">
        {report.marketActivity
          ? <MarketIqDailyEvents
            availability={report.marketActivity}
            marketName={activeMarket.shortLabel}
            timeZone={activeMarket.timeZone}
            headingLevel="h1"
            comparison={<MarketIqDailyEditionComparisonPanel comparison={comparison} timeZone={activeMarket.timeZone} />}
          />
          : <>
            <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-7" aria-label={`Daily ${activeMarket.shortLabel} listing events unavailable`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Daily listing events</p>
              <h1 className="mt-2 text-2xl font-semibold text-[var(--report-primary)]">No events were observed for the period.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This saved market read does not contain a listing-event availability record. No monthly trend, seeded example, freshness time, or other substitute is shown.</p>
            </section>
            <MarketIqDailyEditionComparisonPanel comparison={comparison} timeZone={activeMarket.timeZone} />
          </>}
      </div>
      {report.timeToResolution && <div className="mt-8"><MarketIqTimeToResolution availability={report.timeToResolution} marketName={activeMarket.shortLabel} timeZone={activeMarket.timeZone} /></div>}
    </main>
  );
}
