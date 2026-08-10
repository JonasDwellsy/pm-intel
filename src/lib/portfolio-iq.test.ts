import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";

test("Cleveland owner pilot contains five multifamily assets and four SFRs", () => {
  assert.equal(CLEVELAND_PILOT_PORTFOLIO.marketId, "cleveland-elyria-mentor-oh");
  const multifamily = CLEVELAND_PILOT_PORTFOLIO.assets.filter((asset) => asset.assetType === "multifamily");
  const sfr = CLEVELAND_PILOT_PORTFOLIO.assets.filter((asset) => asset.assetType === "single_family");
  assert.equal(CLEVELAND_PILOT_PORTFOLIO.assets.length, 9);
  assert.equal(multifamily.length, 5);
  assert.equal(sfr.length, 4);
});

test("Greenwood stays one community asset with all six buildings", () => {
  const greenwood = CLEVELAND_PILOT_PORTFOLIO.assets.find((asset) => asset.slug === "greenwood-apartments");
  assert.ok(greenwood);
  assert.equal(greenwood.dwellsyCommunityId, "306583");
  assert.deepEqual(
    greenwood.buildings.map((building) => building.canonicalAddress),
    [
      "221 E 244th St",
      "231 E 244th St",
      "251 E 244th St",
      "261 E 244th St",
      "271 E 244th St",
      "281 E 244th St",
    ]
  );
});

test("unknown URUs remain unknown and every asset receives an audit task", () => {
  for (const asset of CLEVELAND_PILOT_PORTFOLIO.assets) {
    assert.equal(asset.uruStatus, "unknown");
    assert.ok(asset.tasks.some((task) => task.taskType === "issue_uru"));
  }
});

test("SFR ownership remains explicitly synthetic and unconfirmed", () => {
  const sfr = CLEVELAND_PILOT_PORTFOLIO.assets.filter((asset) => asset.assetType === "single_family");
  for (const asset of sfr) {
    assert.equal(asset.matchStatus, "needs_review");
    assert.match(asset.sourceNote, /Ownership is synthetic and requires confirmation/);
  }
});

test("Portfolio IQ migration is additive and does not alter Operator IQ tables", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20260810210000_portfolio_iq_activation/migration.sql"),
    "utf8"
  );
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"(?:PM|Market|WatchList|PropertyHome)"/i);
  assert.match(sql, /CREATE TABLE "PortfolioIqPortfolio"/);
  assert.match(sql, /CREATE TABLE "PortfolioIqActivationTask"/);
});
