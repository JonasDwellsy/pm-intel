import { spawnSync } from "node:child_process";

import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { buildColumbusMarketIqReportSnapshot } from "@/lib/market-iq/report/columbus-build.server";
import { buildSanFranciscoMarketIqReportSnapshot } from "@/lib/market-iq/report/san-francisco-build.server";
import { buildSanJoseMarketIqReportSnapshot } from "@/lib/market-iq/report/san-jose-build.server";
import { storeMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/source-snapshot.server";
import {
  CLEVELAND_MARKET_ID,
  COLUMBUS_MARKET_ID,
  SAN_FRANCISCO_MARKET_ID,
  SAN_JOSE_MARKET_ID,
} from "@/data/market-iq/markets";

function requestedMarket(): string {
  const index = process.argv.indexOf("--market");
  const marketId = index >= 0 ? process.argv[index + 1] : null;
  if (!marketId) throw new Error("Pass one market with --market <market-id>.");
  return marketId;
}

async function build(marketId: string) {
  if (marketId === CLEVELAND_MARKET_ID) return buildClevelandMarketIqReportSnapshot();
  if (marketId === COLUMBUS_MARKET_ID) return buildColumbusMarketIqReportSnapshot();
  if (marketId === SAN_FRANCISCO_MARKET_ID) return buildSanFranciscoMarketIqReportSnapshot();
  if (marketId === SAN_JOSE_MARKET_ID) return buildSanJoseMarketIqReportSnapshot();
  throw new Error(`Unsupported Market IQ market: ${marketId}`);
}

async function main() {
  const marketId = requestedMarket();
  const snapshot = await build(marketId);
  const publishIndex = process.argv.indexOf("--publish-url");
  const publishUrl = publishIndex >= 0 ? process.argv[publishIndex + 1] : null;

  if (publishUrl) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Report source snapshots cannot be published by this script in production.");
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET is required to publish a preview snapshot.");
    if (process.argv.includes("--vercel-protected")) {
      const result = spawnSync("vercel", [
        "curl",
        "/api/market-iq/source-snapshots",
        "--deployment",
        publishUrl,
        "--",
        "--request",
        "POST",
        "--header",
        `Authorization: Bearer ${secret}`,
        "--header",
        "Content-Type: application/json",
        "--data-binary",
        "@-",
      ], {
        input: JSON.stringify({ snapshot }),
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Snapshot publication failed: ${result.stderr.trim()}`);
      console.log(result.stdout.trim());
      return;
    }

    const response = await fetch(new URL("/api/market-iq/source-snapshots", publishUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ snapshot }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Snapshot publication failed (${response.status}): ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result));
    return;
  }

  const stored = await storeMarketIqReportSourceSnapshot(snapshot);
  console.log(JSON.stringify({
    status: "stored",
    marketId: stored.marketId,
    sourceAvailableThrough: stored.sourceAvailableThrough.toISOString().slice(0, 10),
    generatedAt: stored.generatedAt.toISOString(),
    checksum: stored.checksum,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
