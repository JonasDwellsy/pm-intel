import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSourceRefreshManifest, summarizeSourceRefreshItems, trendSnapshotFreshness, validateTrendRefreshItem } from "@/lib/market-iq/source-refresh";

test("refresh manifest covers MSA, every portfolio city, and every ZIP", () => {
  const manifest = buildSourceRefreshManifest("cleveland", [
    { city: "Cleveland", postalCode: "44113", assetType: "multifamily" },
    { city: "Cleveland", postalCode: "44103", assetType: "single_family" },
    { city: "Euclid", postalCode: "44123", assetType: "multifamily" },
  ]);
  assert.deepEqual(manifest.map((item) => `${item.geographyType}:${item.geographyValue}`), ["msa:cleveland", "city:Cleveland", "city:Euclid", "zip:44103", "zip:44113", "zip:44123"]);
  assert.deepEqual(manifest.find((item) => item.geographyValue === "44113")?.requiredSegments.map((item) => `${item.propertyType}:${item.bedrooms}`), ["apartment:0", "apartment:1", "apartment:2", "apartment:3"]);
});

test("coverage validation exposes sparse and stale payloads", () => {
  const requiredSegments = [{ propertyType: "apartment" as const, bedrooms: 1 }, { propertyType: "apartment" as const, bedrooms: 2 }];
  const rows = [{ month: new Date("2026-07-01T00:00:00Z"), propertyType: "apartment", bedrooms: 1, observations: 12, yearOverYearPct: 2.5 }];
  assert.equal(validateTrendRefreshItem({ rows, requiredSegments, now: new Date("2026-08-11T00:00:00Z") }).status, "sparse");
  assert.equal(validateTrendRefreshItem({ rows, requiredSegments, now: new Date("2027-01-01T00:00:00Z") }).status, "stale");
});

test("source freshness fails closed", () => {
  assert.equal(trendSnapshotFreshness(null), "unavailable");
  assert.equal(trendSnapshotFreshness(new Date("2026-07-01"), new Date("2026-08-11")), "fresh");
  assert.equal(trendSnapshotFreshness(new Date("2026-01-01"), new Date("2026-08-11")), "stale");
});

test("refresh summary does not finish while a geography is missing", () => {
  const summary = summarizeSourceRefreshItems([
    { status: "complete", recordCount: 10, sourceAvailableThrough: new Date("2026-07-01") },
    { status: "awaiting_source", recordCount: 0, sourceAvailableThrough: null },
  ]);
  assert.equal(summary.status, "receiving");
  assert.equal(summary.pending, 1);
});

test("refresh source date reflects the weakest geography, not the newest one", () => {
  const summary = summarizeSourceRefreshItems([
    { status: "complete", recordCount: 10, sourceAvailableThrough: new Date("2026-07-01") },
    { status: "complete", recordCount: 10, sourceAvailableThrough: new Date("2026-06-01") },
  ]);
  assert.equal(summary.status, "complete");
  assert.equal(summary.sourceAvailableThrough?.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("source refresh migration is additive and isolated", () => {
  const migration = readFileSync("prisma/migrations/20260811190000_market_iq_source_refresh/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqSourceRefresh"/);
  assert.match(migration, /CREATE TABLE "MarketIqSourceRefreshItem"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "Pm"|ALTER TABLE "Scorecard"/);
});

test("trend ingestion is refresh-aware and trend readers reject stale snapshots", () => {
  const route = readFileSync("src/app/api/market-iq/import/trends/route.ts", "utf8");
  const trendReader = readFileSync("src/lib/market-iq/trends.server.ts", "utf8");
  const portfolioWatch = readFileSync("src/lib/portfolio-iq/watch.server.ts", "utf8");
  assert.match(route, /validateRefreshTarget/);
  assert.match(route, /recordTrendRefreshImport/);
  assert.match(route, /refreshId/);
  assert.match(trendReader, /trendSnapshotFreshness/);
  assert.match(portfolioWatch, /trendSnapshotFreshness/);
});

test("incomplete refreshes do not trigger downstream finding regeneration", () => {
  const server = readFileSync("src/lib/market-iq/source-refresh.server.ts", "utf8");
  assert.match(server, /summary\.status !== "complete"/);
  assert.match(server, /refreshPortfolioWatchSignals/);
  assert.match(server, /runPortfolioMonitoringForPortfolio/);
});
