import { timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";

import { CLEVELAND_MARKET_ID, getMarketIqMarket } from "@/data/market-iq/markets";
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
import { buildMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/market-source-builders.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const configured = process.env.MARKET_IQ_SOURCE_REFRESH_TOKEN ?? process.env.MARKET_IQ_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  const refreshEnabled = marketIqReportSourceRefreshEnabled(process.env);
  const adminAuthorized = Boolean(refreshEnabled && userId && isAdminUser(userId));
  const tokenAuthorized = refreshEnabled && authorized(request);
  if (!adminAuthorized && !tokenAuthorized) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    return Response.json({ error: "The Market IQ report refresh is not fully configured." }, { status: 503 });
  }

  const requestedMarketId = new URL(request.url).searchParams.get("market") ?? CLEVELAND_MARKET_ID;
  const market = getMarketIqMarket(requestedMarketId);
  if (!market || market.status !== "live") {
    return Response.json({ error: "A configured live Market IQ market is required." }, { status: 400 });
  }

  let refreshId: string | null = null;
  let failureStage: MarketIqRefreshFailureStage = "coordination";
  try {
    const lease = await beginMarketIqReportSourceRefresh({
      marketId: market.id,
      startedBy: adminAuthorized ? userId! : "market-iq-nightly-refresh",
      triggerKind: tokenAuthorized ? "scheduled" : "manual",
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
      buildMarketIqReportSourceSnapshot(market.id)
    );
    failureStage = "validation";
    const validation = validateMarketIqLiveReportSnapshot(snapshot);
    failureStage = "persistence";
    const stored = await completeMarketIqReportSourceRefresh({
      refreshId,
      snapshot,
      observationCount: validation.observationCount,
    });
    if (tokenAuthorized) {
      return Response.json({
        status: "stored",
        marketId: stored.marketId,
        sourceAvailableThrough: stored.sourceAvailableThrough.toISOString().slice(0, 10),
        generatedAt: stored.generatedAt.toISOString(),
      });
    }
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
