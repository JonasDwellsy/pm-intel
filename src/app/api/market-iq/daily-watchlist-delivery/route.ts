import { timingSafeEqual } from "node:crypto";

import { runMarketIqDailyWatchlistDelivery } from "@/lib/market-iq/daily-watchlist-delivery.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const configured = process.env.MARKET_IQ_SOURCE_REFRESH_TOKEN ?? process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!marketIqPreviewEnabled() || !authorized(request)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await runMarketIqDailyWatchlistDelivery({ appOrigin: new URL(request.url).origin });
    if (result.failed > 0) {
      return Response.json({ status: "delivery_failed", ...result }, { status: 502 });
    }
    return Response.json({
      status: "complete",
      ...result,
    });
  } catch (error) {
    console.error("[Market IQ] Daily watchlist delivery failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Daily watchlist delivery could not complete." }, { status: 500 });
  }
}
