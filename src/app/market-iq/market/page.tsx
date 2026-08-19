import { notFound, redirect } from "next/navigation";
import { MarketIqIntelligenceWorkspace } from "@/components/market-iq/MarketIqIntelligenceWorkspace";
import { MarketIqMarketPreparing } from "@/components/market-iq/MarketIqMarketPreparing";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { CLEVELAND_MARKET_ID, COLUMBUS_MARKET_ID, listEntitledMarketIqMarkets, SAN_FRANCISCO_MARKET_ID, SAN_JOSE_MARKET_ID } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadClevelandLiveListingPulse, loadDirectMarketListingPulse } from "@/lib/market-iq/live-listings.server";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { loadCachedClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { loadCachedColumbusMarketIqReportSnapshot } from "@/lib/market-iq/report/columbus-build.server";
import { loadCachedSanFranciscoMarketIqReportSnapshot } from "@/lib/market-iq/report/san-francisco-build.server";
import { loadCachedSanJoseMarketIqReportSnapshot } from "@/lib/market-iq/report/san-jose-build.server";
import {
  loadLatestMarketIqReportSourceSnapshot,
  storeMarketIqReportSourceSnapshot,
} from "@/lib/market-iq/report/source-snapshot.server";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { ClevelandLiveListingPulse } from "@/lib/market-iq/live-listings.server";
import { emptyListingSupplySummary } from "@/lib/market-iq/listing-supply";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function timeoutAfter<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The live source did not respond in time.")),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const LONG_HISTORY_SEGMENTS = new Set([
  "apartment:999",
  "apartment:0",
  "apartment:1",
  "apartment:2",
  "house:999",
  "house:2",
  "house:3",
  "house:4",
]);

function hasLongMsaHistory(report: MarketIqReportSnapshot) {
  const msaCells = report.marketRead.cells.filter((cell) =>
    cell.geographyType === "msa" && LONG_HISTORY_SEGMENTS.has(`${cell.propertyType}:${cell.bedrooms}`),
  );
  return msaCells.length === LONG_HISTORY_SEGMENTS.size && msaCells.every((cell) => cell.series.length >= 30);
}

async function loadReportWithoutBlockingPage(
  marketId: string,
  liveLoader: () => Promise<MarketIqReportSnapshot>,
): Promise<MarketIqReportSnapshot | null> {
  const persisted = await loadLatestMarketIqReportSourceSnapshot(marketId);
  if (persisted && hasLongMsaHistory(persisted)) return persisted;

  try {
    const report = await timeoutAfter(liveLoader(), 8_000);
    await storeMarketIqReportSourceSnapshot(report);
    return report;
  } catch (error) {
    console.warn("Market IQ could not refresh a market source snapshot.", {
      marketId,
      error: error instanceof Error ? error.message : String(error),
    });
    return persisted;
  }
}

function unavailableListingPulse(marketName: string): ClevelandLiveListingPulse {
  return {
    ...emptyListingSupplySummary(),
    status: "unavailable",
    sourceName: "Dwellsy production listing database",
    sourceAvailableThrough: null,
    activeListings: 0,
    apartmentListings: 0,
    houseListings: 0,
    newEvents: 0,
    relistedEvents: 0,
    reactivatedEvents: 0,
    priceChangeEvents: 0,
    deactivatedEvents: 0,
    message: `Current ${marketName} listing activity is refreshing. The saved rent analysis remains available.`,
  };
}

async function loadListingPulseWithoutBlockingPage(
  marketName: string,
  loader: () => Promise<ClevelandLiveListingPulse>,
): Promise<ClevelandLiveListingPulse> {
  try {
    return await timeoutAfter(loader(), 3_000);
  } catch {
    return unavailableListingPulse(marketName);
  }
}

export default async function MarketIqPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  // The flag check intentionally happens before Clerk or Prisma. When the
  // preview is disabled, the route is indistinguishable from a missing page
  // and cannot add database load to the existing Operator IQ application.
  if (!marketIqPreviewEnabled()) notFound();

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct) redirect("/market-iq/subscribe");

  const [{ organizationId }, query] = await Promise.all([getActiveOrgContext(), searchParams]);
  const preference = organizationId
    ? await prisma.marketIqWorkspacePreference.findUnique({
      where: { organizationId },
      select: { onboardingCompletedAt: true, defaultMarketId: true },
    })
    : null;
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: preference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket) redirect("/market-iq/subscribe");

  if (access.source === "subscription") {
    if (organizationId && !preference?.onboardingCompletedAt) redirect("/market-iq/get-started");
  }

  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  if (activeMarket.status !== "live") {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
        <MarketIqMarketPreparing market={activeMarket} />
      </main>
    );
  }

  const reportLoader = activeMarket.id === COLUMBUS_MARKET_ID
    ? loadCachedColumbusMarketIqReportSnapshot
    : activeMarket.id === SAN_FRANCISCO_MARKET_ID
      ? loadCachedSanFranciscoMarketIqReportSnapshot
      : activeMarket.id === SAN_JOSE_MARKET_ID
        ? loadCachedSanJoseMarketIqReportSnapshot
        : loadCachedClevelandMarketIqReportSnapshot;
  const [report, liveListingPulse] = await Promise.all([
    loadReportWithoutBlockingPage(activeMarket.id, reportLoader),
    loadListingPulseWithoutBlockingPage(
      activeMarket.shortLabel,
      activeMarket.id === CLEVELAND_MARKET_ID
        ? loadClevelandLiveListingPulse
        : () => loadDirectMarketListingPulse({ marketName: activeMarket.shortLabel, msaCode: activeMarket.cbsaCode }),
    ),
  ]);

  if (!report) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
        <MarketIqMarketPreparing market={activeMarket} state="source_unavailable" />
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 pt-8 sm:px-7 lg:px-10 lg:pt-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
      </div>
      <MarketIqIntelligenceWorkspace
        report={report}
        market={activeMarket}
        listingSync={{
          status: liveListingPulse.status,
          availableThrough: liveListingPulse.sourceAvailableThrough?.toISOString() ?? null,
          activeListings: liveListingPulse.activeListings,
          apartmentListings: liveListingPulse.apartmentListings,
          houseListings: liveListingPulse.houseListings,
          ageObservedListings: liveListingPulse.ageObservedListings,
          medianActiveAgeDays: liveListingPulse.medianActiveAgeDays,
          activeOver30Days: liveListingPulse.activeOver30Days,
          activeOver30SharePct: liveListingPulse.activeOver30SharePct,
          activatedLast7Days: liveListingPulse.activatedLast7Days,
          activatedLast30Days: liveListingPulse.activatedLast30Days,
          listingAgeBuckets: liveListingPulse.listingAgeBuckets,
          newEvents: liveListingPulse.newEvents,
          relistedEvents: liveListingPulse.relistedEvents,
          priceChangeEvents: liveListingPulse.priceChangeEvents,
          message: liveListingPulse.message,
        }}
        clientAdvisoryEnabled={access.capabilities.publishClientReports}
      />
    </>
  );
}
