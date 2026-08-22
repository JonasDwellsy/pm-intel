import { timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isAdminUser } from "@/lib/auth/is-admin";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { runClevelandListingFeed } from "@/lib/market-iq/listing-feed-run.server";
import {
  MarketIqListingFeedAlreadyRunningError,
  MarketIqListingFeedOperationFailedError,
  scheduledMarketIqListingFeedOperationKey,
} from "@/lib/market-iq/listing-feed-reliability";
import { marketIqDatabaseConfigured } from "@/lib/market-iq/prisma";
import { marketIqReportSourceRefreshEnabled } from "@/lib/market-iq/report-source-refresh";

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
  const adminAuthorized = Boolean(
    userId
    && isAdminUser(userId)
    && marketIqReportSourceRefreshEnabled(process.env),
  );
  const tokenAuthorized = marketIqPreviewEnabled() && authorized(request);
  const browserForm = request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") === true;
  if (!adminAuthorized && !tokenAuthorized) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    if (adminAuthorized && browserForm) {
      return Response.redirect(new URL("/market-iq/internal/readiness?supply=unavailable", request.url), 303);
    }
    return Response.json({ error: "The Market IQ listing feed is not fully configured." }, { status: 503 });
  }
  try {
    const triggerKind = tokenAuthorized && !adminAuthorized ? "scheduled" : "manual";
    const result = await runClevelandListingFeed({
      triggerKind,
      startedBy: adminAuthorized ? userId! : "listing-feed-automation",
      operationKey: triggerKind === "scheduled"
        ? scheduledMarketIqListingFeedOperationKey({ marketId: CLEVELAND_MARKET_ID, now: new Date() })
        : undefined,
    });
    if (adminAuthorized && browserForm) {
      return Response.redirect(new URL("/market-iq/internal/readiness?supply=stored", request.url), 303);
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketIqListingFeedAlreadyRunningError) {
      if (adminAuthorized && browserForm) {
        return Response.redirect(new URL("/market-iq/internal/readiness?supply=running", request.url), 303);
      }
      return Response.json(
        { error: error.message, status: "already_running" },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }
    if (error instanceof MarketIqListingFeedOperationFailedError) {
      return Response.json(
        { error: error.message, status: "failed" },
        { status: 409 },
      );
    }
    console.error("[market-iq/source/dwellsy/refresh] failed", error);
    if (adminAuthorized && browserForm) {
      return Response.redirect(new URL("/market-iq/internal/readiness?supply=blocked", request.url), 303);
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Listing refresh failed." },
      { status: 502 }
    );
  }
}
