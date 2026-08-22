import { auth } from "@clerk/nextjs/server";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isAdminUser } from "@/lib/auth/is-admin";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { marketIqDatabaseConfigured } from "@/lib/market-iq/prisma";
import { marketIqReportSourceRefreshEnabled } from "@/lib/market-iq/report-source-refresh";
import {
  blockMarketIqReportSourceRefresh,
  beginMarketIqReportSourceRefresh,
  completeMarketIqReportSourceRefresh,
} from "@/lib/market-iq/report-refresh-reliability.server";
import {
  recordedMarketIqRefreshFailure,
  runMarketIqSourceWithRetry,
  validateMarketIqLiveReportSnapshot,
  type MarketIqRefreshFailureStage,
} from "@/lib/market-iq/report-refresh-reliability";
import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!marketIqReportSourceRefreshEnabled(process.env) || !userId || !isAdminUser(userId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    return Response.json({ error: "The Market IQ report refresh is not fully configured." }, { status: 503 });
  }

  let refreshId: string | null = null;
  let failureStage: MarketIqRefreshFailureStage = "coordination";
  try {
    const lease = await beginMarketIqReportSourceRefresh({
      marketId: CLEVELAND_MARKET_ID,
      startedBy: userId,
    });
    if (lease.state === "already_running") {
      return Response.json(
        { error: "A Market IQ source refresh is already running." },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }
    refreshId = lease.refreshId;

    failureStage = "source";
    const { value: snapshot } = await runMarketIqSourceWithRetry(() =>
      buildClevelandMarketIqReportSnapshot({ sourceMode: "live_only" })
    );
    failureStage = "validation";
    const validation = validateMarketIqLiveReportSnapshot(snapshot);
    failureStage = "persistence";
    await completeMarketIqReportSourceRefresh({
      refreshId,
      snapshot,
      observationCount: validation.observationCount,
    });
    return Response.redirect(
      new URL("/market-iq/internal/readiness?refresh=stored", request.url),
      303,
    );
  } catch (error) {
    if (refreshId) {
      await blockMarketIqReportSourceRefresh({
        refreshId,
        stage: failureStage,
        error,
      }).catch(() => undefined);
    }
    const safeFailure = recordedMarketIqRefreshFailure({ stage: failureStage, error });
    console.error("[Market IQ] Authoritative Trends refresh failed", safeFailure);
    return Response.json(
      { error: "The authoritative Trends source could not be refreshed." },
      { status: failureStage === "source" || failureStage === "validation" ? 502 : 503 },
    );
  }
}
