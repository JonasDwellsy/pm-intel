import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MARKET_IQ_CANONICAL_ROUTES,
  MARKET_IQ_CLIENT_REPORTING_ROUTES,
  MARKET_IQ_MARKET_INTELLIGENCE_ROUTES,
} from "./market-iq/navigation";

const CLEVELAND_PILOT_IMPORT = "@/data/market-iq/cleveland-pilot";

const CLEVELAND_COUPLING_BASELINE = [
  "src/app/market-iq/delivery/[campaignId]/page.tsx",
  "src/app/market-iq/distribution/[campaignId]/page.tsx",
  "src/app/market-iq/distribution/actions.ts",
  "src/app/market-iq/distribution/page.tsx",
  "src/app/market-iq/launch/actions.ts",
  "src/app/market-iq/launch/page.tsx",
  "src/app/market-iq/performance/briefing/page.tsx",
  "src/app/market-iq/performance/page.tsx",
  "src/app/market-iq/published/[campaignId]/page.tsx",
  "src/lib/market-iq/alert-history.server.ts",
  "src/lib/market-iq/historical.server.ts",
  "src/lib/market-iq/listing-feed-run.server.ts",
  "src/lib/market-iq/live-listings.server.ts",
  "src/lib/market-iq/report/build.server.ts",
  "src/lib/market-iq/trends.server.ts",
  "src/lib/market-iq/watchlists.server.ts",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const file = path.join(root, entry);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) return [];
    return [file];
  });
}

function pageFile(route: string) {
  return path.join("src", "app", ...route.split("/").filter(Boolean), "page.tsx");
}

test("every canonical Market IQ destination has an App Router page", () => {
  const routes = new Set([
    ...Object.values(MARKET_IQ_CANONICAL_ROUTES),
    ...Object.values(MARKET_IQ_MARKET_INTELLIGENCE_ROUTES),
    ...Object.values(MARKET_IQ_CLIENT_REPORTING_ROUTES),
  ]);

  const missing = [...routes].filter((route) => !existsSync(pageFile(route)));
  assert.deepEqual(missing, []);
});

test("Cleveland pilot coupling cannot spread beyond the documented baseline", () => {
  const files = [
    ...sourceFiles(path.join("src", "app", "market-iq")),
    ...sourceFiles(path.join("src", "lib", "market-iq")),
  ];
  const coupledFiles = files
    .filter((file) => readFileSync(file, "utf8").includes(CLEVELAND_PILOT_IMPORT))
    .sort();

  assert.deepEqual(coupledFiles, [...CLEVELAND_COUPLING_BASELINE].sort());
});

test("the shared Market Intelligence route uses the market data service boundary", () => {
  const source = readFileSync("src/app/market-iq/market/page.tsx", "utf8");
  const forbiddenImports = [
    "@/lib/market-iq/report/build.server",
    "@/lib/market-iq/report/columbus-build.server",
    "@/lib/market-iq/report/san-francisco-build.server",
    "@/lib/market-iq/report/san-jose-build.server",
    "@/lib/market-iq/live-listings.server",
    "@/lib/market-iq/report/source-snapshot.server",
  ];

  assert.equal(source.includes("@/lib/market-iq/data/service.server"), true);
  for (const forbiddenImport of forbiddenImports) {
    assert.equal(source.includes(forbiddenImport), false, `Shared route imports ${forbiddenImport}`);
  }
});
