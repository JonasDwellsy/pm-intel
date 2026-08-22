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
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx)$/.test(file)) return [];
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

test("production source never imports the seeded Cleveland report module", () => {
  const seededImport = /from\s+["'][^"']*seeded-cleveland["']/;
  const importers = sourceFiles("src")
    .filter((file) => seededImport.test(readFileSync(file, "utf8")))
    .sort();

  assert.deepEqual(importers, []);
});

test("Market IQ development workspace activation never creates report evidence", () => {
  const source = readFileSync("src/app/setup-workspace/actions.ts", "utf8");

  assert.match(source, /marketIqDevelopmentPreviewEnabled\(\)/);
  assert.doesNotMatch(source, /marketIqReport\.(create|upsert)/);
  assert.doesNotMatch(source, /preview-bootstrap|PREVIEW_BASELINE_TOKEN/);
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

test("the Daily Edition is a dedicated persisted-evidence route rather than part of Market Overview", () => {
  const dailyRoute = readFileSync("src/app/market-iq/daily/page.tsx", "utf8");
  const archiveReader = readFileSync("src/lib/market-iq/daily-editions.server.ts", "utf8");
  const snapshotRepository = readFileSync("src/lib/market-iq/report/source-snapshot.server.ts", "utf8");
  const overview = readFileSync("src/components/market-iq/MarketIqIntelligenceWorkspace.tsx", "utf8");

  assert.match(dailyRoute, /loadMarketIqDailyEditionArchive/);
  assert.match(dailyRoute, /MarketIqDailyEvents/);
  assert.match(dailyRoute, /MarketIqDailyEditionArchive/);
  assert.match(dailyRoute, /basePath=\{MARKET_IQ_MARKET_INTELLIGENCE_ROUTES\.daily\}/);
  assert.doesNotMatch(dailyRoute, /loadMarketIqMarketData|loadReport|storeReport/);
  assert.match(archiveReader, /loadMarketIqReportSourceSnapshotCandidates/);
  assert.match(snapshotRepository, /marketIqReportSourceSnapshot\.findMany/);
  assert.doesNotMatch(overview, /MarketIqDailyEvents|MarketIqTimeToResolution/);
});

test("Daily Edition is the canonical entry while Market Overview remains a distinct monthly route", () => {
  const navigation = readFileSync("src/components/market-iq/MarketIqAppNavigation.tsx", "utf8");
  const entry = readFileSync("src/lib/market-iq/entry.ts", "utf8");

  assert.equal(MARKET_IQ_CANONICAL_ROUTES.marketIntelligence, MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily);
  assert.equal(MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview, "/market-iq/market");
  assert.match(navigation, /href: MARKET_IQ_CANONICAL_ROUTES\.marketIntelligence, label: "Market intelligence"/);
  assert.match(entry, /MARKET_IQ_APPLICATION_PATH = MARKET_IQ_CANONICAL_ROUTES\.marketIntelligence/);
});

test("interactive Market IQ reads persisted evidence and Cleveland source builds fail closed", () => {
  const service = readFileSync("src/lib/market-iq/data/service.server.ts", "utf8");
  const clevelandBuild = readFileSync("src/lib/market-iq/report/build.server.ts", "utf8");
  const composer = readFileSync("src/lib/market-iq/report/composer.server.ts", "utf8");
  const reportParser = readFileSync("src/lib/market-iq/report/report.ts", "utf8");

  assert.match(service, /refreshReport: false/);
  assert.doesNotMatch(clevelandBuild, /SEEDED_CLEVELAND_TREND_SERIES/);
  assert.doesNotMatch(clevelandBuild, /seededClevelandMarketReport/);
  assert.doesNotMatch(clevelandBuild, /SEEDED_CLEVELAND_REPORT_TOKEN/);
  assert.doesNotMatch(composer, /seededClevelandMarketReport/);
  assert.doesNotMatch(composer, /generatedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(reportParser, /parsed\.scope\.seededExample !== false/);
  assert.match(clevelandBuild, /throw new Error\("The authoritative Dwellsy Trends source is not configured\."\)/);
  assert.match(clevelandBuild, /Promise\.all\(\[\s*loadDwellsyTrendSeries/);
});
