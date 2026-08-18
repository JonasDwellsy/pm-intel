import { NextResponse } from "next/server";

import { getMarketIqMarket } from "@/data/market-iq/markets";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { storeMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/source-snapshot.server";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function isolatedPreview(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.MARKET_IQ_PREVIEW_ENABLED === "1" &&
    process.env.MARKET_IQ_USE_PROJECT_DATABASE === "1" &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL === "market-iq-mu.vercel.app"
  );
}

export async function POST(request: Request) {
  if (!isolatedPreview()) return NextResponse.json({ error: "Preview-only endpoint." }, { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json() as { snapshot?: unknown };
    const snapshot = parseMarketIqReportSnapshot(JSON.stringify(body.snapshot));
    if (!snapshot || !getMarketIqMarket(snapshot.scope.marketId)) {
      return NextResponse.json({ error: "A valid configured Market IQ snapshot is required." }, { status: 400 });
    }
    if (snapshot.scope.seededExample) {
      return NextResponse.json({ error: "Seeded examples cannot be stored as source evidence." }, { status: 400 });
    }
    const trendsSource = snapshot.sources.find((source) => source.name === "Dwellsy IQ Trends");
    if (!trendsSource) {
      return NextResponse.json({ error: "The snapshot has no Dwellsy IQ Trends source." }, { status: 400 });
    }

    const stored = await storeMarketIqReportSourceSnapshot(snapshot);
    return NextResponse.json({
      status: "stored",
      marketId: stored.marketId,
      sourceAvailableThrough: stored.sourceAvailableThrough.toISOString().slice(0, 10),
      generatedAt: stored.generatedAt.toISOString(),
      checksum: stored.checksum,
    });
  } catch (error) {
    console.error("[Market IQ] Source snapshot ingestion failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "The source snapshot could not be stored." }, { status: 500 });
  }
}
