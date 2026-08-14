import { timingSafeEqual } from "node:crypto";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { runClevelandListingFeed } from "@/lib/market-iq/listing-feed-run.server";
import { marketIqDatabaseConfigured } from "@/lib/market-iq/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const configured = process.env.MARKET_IQ_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!marketIqPreviewEnabled() || !authorized(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    return Response.json({ error: "The Market IQ listing feed is not fully configured." }, { status: 503 });
  }
  try {
    return Response.json(await runClevelandListingFeed({ triggerKind: "manual", startedBy: "import-token" }));
  } catch (error) {
    console.error("[market-iq/source/dwellsy/refresh] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Listing refresh failed." },
      { status: 502 }
    );
  }
}
