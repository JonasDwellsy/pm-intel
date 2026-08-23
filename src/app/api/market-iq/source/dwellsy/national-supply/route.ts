import { timingSafeEqual } from "node:crypto";

import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { runNationalListingSupplyCapture } from "@/lib/market-iq/national-listing-supply-run.server";
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
  if (!marketIqReportSourceRefreshEnabled(process.env) || !authorized(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!marketIqDatabaseConfigured() || !dwellsySourceConfigured()) {
    return Response.json({ error: "The national Market IQ supply capture is not fully configured." }, { status: 503 });
  }
  try {
    return Response.json(await runNationalListingSupplyCapture());
  } catch (error) {
    console.error("[Market IQ] National listing-supply capture failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "The national listing-supply capture failed." }, { status: 502 });
  }
}
