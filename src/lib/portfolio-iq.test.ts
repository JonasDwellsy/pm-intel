import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";
import { proposeCompMembers } from "@/lib/portfolio-iq/comp-generator";
import { buildSubjectPerformance, propertyDecisionRead } from "@/lib/portfolio-iq/property";
import { buildPortfolioWatchDrafts } from "@/lib/portfolio-iq/watch";
import { buildPortfolioIqDigest } from "@/lib/portfolio-iq/digest";

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

test("comp proposal excludes the subject, dedupes units, and prioritizes same ZIP", () => {
  const base = {
    communityName: null,
    state: "OH",
    propertyType: "apartment",
    bedrooms: 2,
    bathrooms: 1,
    askingRent: 1200,
    squareFeet: 900,
  };
  const proposed = proposeCompMembers({
    subjectAddresses: ["221 E 244th St"],
    city: "Euclid",
    postalCode: "44123",
    candidates: [
      { ...base, sourceRecordId: "subject", address: "221 E 244th St Apt 2", city: "Euclid", postalCode: "44123", activatedAt: new Date("2026-07-01") },
      { ...base, sourceRecordId: "near-old", address: "300 E 250th St Unit 1", city: "Euclid", postalCode: "44123", activatedAt: new Date("2026-05-01") },
      { ...base, sourceRecordId: "near-new", address: "300 E 250th St Unit 4", city: "Euclid", postalCode: "44123", activatedAt: new Date("2026-07-15") },
      { ...base, sourceRecordId: "msa", address: "100 Main St", city: "Cleveland", postalCode: "44114", activatedAt: new Date("2026-07-20") },
    ],
  });
  assert.equal(proposed.length, 2);
  assert.equal(proposed[0].sourceRecordId, "near-new");
  assert.equal(proposed[0].selectionReason, "Same ZIP code");
  assert.equal(proposed[1].selectionReason, "Cleveland MSA fallback");
});

test("subject performance compares observed asking rent with comp evidence", () => {
  const performance = buildSubjectPerformance({
    availableThrough: new Date("2026-07-31T00:00:00Z"),
    observations: [
      { askingRent: 1200, squareFeet: 800, bedrooms: 2, activatedAt: new Date("2026-07-01"), deactivatedAt: new Date("2026-07-21") },
      { askingRent: 1100, squareFeet: 800, bedrooms: 2, activatedAt: new Date("2026-03-01"), deactivatedAt: new Date("2026-04-01") },
    ],
    compAskingRents: [1000, 1100],
    compRentPerSqFt: [1.25, 1.375],
  });
  assert.equal(performance.observationCount, 2);
  assert.equal(performance.askingRent, 1150);
  assert.equal(performance.medianDom, 25.5);
  assert.ok(performance.askingRentVsComps !== null && performance.askingRentVsComps > 9);
});

test("property decision read preserves an explicit evidence gap", () => {
  assert.match(
    propertyDecisionRead({
      propertyName: "Test Property",
      observationCount: 0,
      askingRentVsComps: null,
      askingRentChange90d: null,
    }),
    /does not yet have enough matched subject listing observations/
  );
});

test("comp-set migration remains additive", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20260810220000_portfolio_iq_comp_sets/migration.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "PortfolioIqCompSet"/);
  assert.match(sql, /CREATE TABLE "PortfolioIqCompMember"/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"(?:PM|Market|WatchList|MarketIqListing)"/i);
});

test("comp-review migration is additive and preserves every IQ source table", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20260810230000_portfolio_iq_comp_review/migration.sql"),
    "utf8"
  );
  assert.match(sql, /ADD COLUMN "reviewStatus"/);
  assert.match(sql, /ADD COLUMN "reviewedBy"/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"(?:PM|Market|WatchList|MarketIqListing)"/i);
});

test("Portfolio Watch gates comp-relative conclusions on locked evidence", () => {
  const base = {
    portfolioId: "p1", assetId: "a1", assetSlug: "asset", assetName: "Asset",
    matchStatus: "matched", uruStatus: "observed", observationCount: 4,
    askingRentVsComps: -12, askingRentChange90d: -4, medianDom: 55,
    marketAlert: null, observedAt: new Date("2026-07-31"),
  };
  const proposed = buildPortfolioWatchDrafts({ ...base, compStatus: "proposed" });
  assert.equal(proposed.some((signal) => signal.category === "performance"), false);
  assert.equal(proposed.some((signal) => signal.signalType === "comp_review_pending"), true);
  const locked = buildPortfolioWatchDrafts({ ...base, compStatus: "locked" });
  assert.equal(locked.some((signal) => signal.signalType === "rent_below_comps"), true);
  assert.equal(locked.some((signal) => signal.signalType === "rent_softening"), true);
  assert.equal(locked.some((signal) => signal.signalType === "listing_velocity_slow"), true);
});

test("Portfolio Watch migration is additive and isolated from other IQ products", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260810240000_portfolio_iq_watch/migration.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqSignal"/);
  assert.match(sql, /CREATE TABLE "PortfolioIqDigestPreference"/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"(?:PM|Market|WatchList|MarketIqListing)"/i);
});

test("Portfolio IQ digest uses the same ranked signals and preserves asking-market limits", () => {
  const digest = buildPortfolioIqDigest({
    portfolioName: "Owner Portfolio",
    recipientName: "Owner",
    dashboardUrl: "https://example.com/portfolio-iq",
    preview: true,
    signals: [{
      severity: "high", category: "performance", headline: "Rent is below comps",
      narrative: "Observed asking rent is 10% below the locked comp median.",
      ownerQuestion: "Should the manager test a higher asking rent?",
      asset: { slug: "asset", name: "Asset" },
    }],
  });
  assert.match(digest.subject, /^\[preview\] Portfolio IQ:/);
  assert.match(digest.text, /Rent is below comps/);
  assert.match(digest.text, /does not measure occupancy, signed leases, or effective rent/);
  assert.equal(digest.signalCount, 1);
});
