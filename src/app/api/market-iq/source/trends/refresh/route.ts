import { auth } from "@clerk/nextjs/server";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isAdminUser } from "@/lib/auth/is-admin";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import { marketIqReportSourceRefreshEnabled } from "@/lib/market-iq/report-source-refresh";
import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { storeMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/source-snapshot.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function observationCount(snapshot: Awaited<ReturnType<typeof buildClevelandMarketIqReportSnapshot>>) {
  return snapshot.marketRead.cells.reduce(
    (total, cell) => total + cell.series.length,
    0,
  );
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!marketIqReportSourceRefreshEnabled(process.env) || !userId || !isAdminUser(userId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    return Response.json({ error: "The Market IQ report refresh is not fully configured." }, { status: 503 });
  }

  let refreshId: string | null = null;
  try {
    const refresh = await marketIqPrisma.marketIqSourceRefresh.create({
      data: {
        marketId: CLEVELAND_MARKET_ID,
        sourceKind: "trends",
        triggerKind: "manual",
        status: "running",
        requiredManifest: JSON.stringify([{ marketId: CLEVELAND_MARKET_ID }]),
        requiredGeographies: 1,
        startedBy: userId,
      },
      select: { id: true },
    });
    refreshId = refresh.id;

    const snapshot = await buildClevelandMarketIqReportSnapshot({ sourceMode: "live_only" });
    if (snapshot.scope.seededExample) {
      throw new Error("A seeded report cannot be stored as source evidence.");
    }
    const stored = await storeMarketIqReportSourceSnapshot(snapshot);
    const records = observationCount(snapshot);
    await marketIqPrisma.marketIqSourceRefresh.update({
      where: { id: refresh.id },
      data: {
        status: "complete",
        sourceAvailableThrough: stored.sourceAvailableThrough,
        receivedGeographies: 1,
        recordCount: records,
        completedAt: new Date(),
      },
    });
    return Response.redirect(
      new URL("/market-iq/internal/readiness?refresh=stored", request.url),
      303,
    );
  } catch (error) {
    if (refreshId) {
      await marketIqPrisma.marketIqSourceRefresh.update({
        where: { id: refreshId },
        data: {
          status: "blocked",
          error: JSON.stringify({
            name: error instanceof Error ? error.name : "UnknownError",
            message: "Authoritative Trends refresh failed.",
          }),
          completedAt: new Date(),
        },
      }).catch(() => undefined);
    }
    console.error("[Market IQ] Authoritative Trends refresh failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "The authoritative Trends source could not be refreshed." }, { status: 502 });
  }
}
