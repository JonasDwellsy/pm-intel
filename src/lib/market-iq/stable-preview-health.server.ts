import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/markets";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { resolveMarketIqStablePreviewHealth } from "@/lib/market-iq/stable-preview-health";

export async function loadMarketIqStablePreviewHealth(now = new Date()) {
  const databaseConfigured = marketIqDatabaseConfigured();
  const sourceConfigured = dwellsySourceConfigured();
  const reportRefreshManifest = JSON.stringify([{ marketId: CLEVELAND_MARKET_ID }]);
  if (!databaseConfigured) {
    return resolveMarketIqStablePreviewHealth({
      marketId: CLEVELAND_MARKET_ID,
      now,
      databaseConfigured,
      databaseReachable: false,
      sourceConfigured,
      snapshot: null,
      latestRefresh: null,
      listingSnapshot: null,
      latestListingRefresh: null,
    });
  }

  try {
    const [
      snapshotRow,
      activeRefresh,
      latestTerminalRefresh,
      listingSnapshot,
      activeListingRefresh,
      latestTerminalListingRefresh,
    ] = await Promise.all([
      marketIqPrisma.marketIqReportSourceSnapshot.findFirst({
        where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "dwellsy_trends" },
        orderBy: [{ sourceAvailableThrough: "desc" }, { generatedAt: "desc" }],
        select: {
          sourceAvailableThrough: true,
          generatedAt: true,
          snapshot: true,
        },
      }),
      marketIqPrisma.marketIqSourceRefresh.findFirst({
        where: {
          marketId: CLEVELAND_MARKET_ID,
          sourceKind: "trends",
          requiredManifest: reportRefreshManifest,
          completedAt: null,
        },
        orderBy: { startedAt: "asc" },
        select: { status: true, startedAt: true, completedAt: true },
      }),
      marketIqPrisma.marketIqSourceRefresh.findFirst({
        where: {
          marketId: CLEVELAND_MARKET_ID,
          sourceKind: "trends",
          requiredManifest: reportRefreshManifest,
          completedAt: { not: null },
        },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        select: { status: true, startedAt: true, completedAt: true },
      }),
      marketIqPrisma.marketIqListingSupplySnapshot.findFirst({
        where: { marketId: CLEVELAND_MARKET_ID },
        orderBy: [{ snapshotDate: "desc" }, { capturedAt: "desc" }],
        select: {
          sourceAvailableThrough: true,
          capturedAt: true,
          activeListings: true,
          apartmentListings: true,
          houseListings: true,
          ageObservedListings: true,
        },
      }),
      marketIqPrisma.marketIqListingFeedRun.findFirst({
        where: {
          marketId: CLEVELAND_MARKET_ID,
          sourceKind: "dwellsy_production",
          completedAt: null,
        },
        orderBy: { startedAt: "asc" },
        select: { status: true, startedAt: true, completedAt: true },
      }),
      marketIqPrisma.marketIqListingFeedRun.findFirst({
        where: {
          marketId: CLEVELAND_MARKET_ID,
          sourceKind: "dwellsy_production",
          completedAt: { not: null },
        },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        select: { status: true, startedAt: true, completedAt: true },
      }),
    ]);
    const parsedSnapshot = snapshotRow
      ? parseMarketIqReportSnapshot(snapshotRow.snapshot)
      : null;

    return resolveMarketIqStablePreviewHealth({
      marketId: CLEVELAND_MARKET_ID,
      now,
      databaseConfigured,
      databaseReachable: true,
      sourceConfigured,
      snapshot: snapshotRow
        ? {
          sourceAvailableThrough: snapshotRow.sourceAvailableThrough,
          generatedAt: snapshotRow.generatedAt,
          valid: Boolean(parsedSnapshot),
        }
        : null,
      latestRefresh: activeRefresh ?? latestTerminalRefresh,
      listingSnapshot,
      latestListingRefresh: activeListingRefresh ?? latestTerminalListingRefresh,
    });
  } catch (error) {
    console.error("[Market IQ] Stable preview health unavailable", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return resolveMarketIqStablePreviewHealth({
      marketId: CLEVELAND_MARKET_ID,
      now,
      databaseConfigured,
      databaseReachable: false,
      sourceConfigured,
      snapshot: null,
      latestRefresh: null,
      listingSnapshot: null,
      latestListingRefresh: null,
    });
  }
}
