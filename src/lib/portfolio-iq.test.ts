import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";
import { proposeCompMembers } from "@/lib/portfolio-iq/comp-generator";
import { buildSubjectPerformance, propertyDecisionRead } from "@/lib/portfolio-iq/property";
import { buildPortfolioWatchDrafts } from "@/lib/portfolio-iq/watch";
import { buildPortfolioIqDigest } from "@/lib/portfolio-iq/digest";
import { isPortfolioSignalActionable, portfolioDecisionLabel } from "@/lib/portfolio-iq/decision";
import { buildBedroomSegments } from "@/lib/portfolio-iq/segments";
import { parseTodaySignalEvidence, selectTodaySignals } from "@/lib/portfolio-iq/today";

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
    askingRentVsComps: -12, rentPerSqFtVsComps: 8, askingRentChange90d: -4, medianDom: 55,
    marketAlert: null, observedAt: new Date("2026-07-31"),
  };
  const proposed = buildPortfolioWatchDrafts({ ...base, compStatus: "proposed" });
  assert.equal(proposed.some((signal) => signal.category === "performance"), false);
  assert.equal(proposed.some((signal) => signal.signalType === "comp_review_pending"), true);
  const locked = buildPortfolioWatchDrafts({ ...base, compStatus: "locked" });
  assert.equal(locked.some((signal) => signal.signalType === "rent_below_comps"), true);
  assert.equal(locked.some((signal) => signal.signalType === "rent_softening"), true);
  assert.equal(locked.some((signal) => signal.signalType === "listing_velocity_slow"), true);
  assert.equal(locked.some((signal) => signal.signalType === "rent_psf_above_comps"), true);
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
      decision: { state: "acknowledged", assignedTo: "Asset manager" },
    }],
  });
  assert.match(digest.subject, /^\[preview\] Portfolio IQ:/);
  assert.match(digest.text, /Rent is below comps/);
  assert.match(digest.text, /Assigned to: Asset manager/);
  assert.match(digest.text, /does not measure occupancy, signed leases, or effective rent/);
  assert.equal(digest.signalCount, 1);
});

test("Portfolio Watch decision visibility respects resolve and seven-day snooze", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  assert.equal(isPortfolioSignalActionable(null, now), true);
  assert.equal(isPortfolioSignalActionable({ state: "acknowledged", snoozedUntil: null }, now), true);
  assert.equal(isPortfolioSignalActionable({ state: "resolved", snoozedUntil: null }, now), false);
  assert.equal(isPortfolioSignalActionable({ state: "snoozed", snoozedUntil: new Date("2026-08-17T12:00:00Z") }, now), false);
  assert.equal(isPortfolioSignalActionable({ state: "snoozed", snoozedUntil: new Date("2026-08-09T12:00:00Z") }, now), true);
  assert.equal(portfolioDecisionLabel("acknowledged"), "Acknowledged");
});

test("Portfolio IQ decision migration is additive and preserves signal evidence", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260810250000_portfolio_iq_decisions/migration.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqSignalDecision"/);
  assert.match(sql, /CREATE TABLE "PortfolioIqSignalDecisionEvent"/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"PortfolioIqSignal"\s+(?:DROP|ALTER COLUMN)/i);
});

test("bedroom segments never substitute market inventory for an unobserved subject product", () => {
  const observations = Array.from({ length: 4 }, (_, index) => ({
    askingRent: 1000 + index * 25, squareFeet: 700, bedrooms: 2,
    activatedAt: new Date(`2026-0${index + 3}-01T00:00:00Z`), deactivatedAt: new Date(`2026-0${index + 3}-20T00:00:00Z`),
  }));
  const segments = buildBedroomSegments({
    observations, availableThrough: new Date("2026-07-31T00:00:00Z"),
    reviews: [{ bedrooms: 2, status: "locked" }],
    compMembers: [
      { propertyLabel: "Comp A", address: "1 Main St", bedrooms: 2, askingRent: 1000, squareFeet: 700, reviewStatus: "included" },
      { propertyLabel: "Comp B", address: "2 Main St", bedrooms: 2, askingRent: 1050, squareFeet: 720, reviewStatus: "included" },
      { propertyLabel: "Comp C", address: "3 Main St", bedrooms: 2, askingRent: 1100, squareFeet: 740, reviewStatus: "included" },
    ],
  });
  assert.equal(segments.find((segment) => segment.bedrooms === 0)?.evidenceStatus, "not_observed");
  assert.equal(segments.find((segment) => segment.bedrooms === 1)?.evidenceStatus, "not_observed");
  assert.equal(segments.find((segment) => segment.bedrooms === 2)?.evidenceStatus, "locked");
  assert.equal(segments.find((segment) => segment.bedrooms === 3)?.evidenceStatus, "not_observed");
});

test("segment signals name the bedroom product and suppress mixed property-wide conclusions", () => {
  const drafts = buildPortfolioWatchDrafts({
    portfolioId: "p1", assetId: "a1", assetSlug: "acadian", assetName: "Acadian",
    matchStatus: "matched", uruStatus: "observed", compStatus: "locked", observationCount: 50,
    askingRentVsComps: -20, rentPerSqFtVsComps: 12, askingRentChange90d: -5, medianDom: 60,
    segments: [{ bedrooms: 2, label: "2-bedroom", isLocked: true, observationCount: 50, askingRentVsComps: 1, rentPerSqFtVsComps: 8, askingRentChange90d: 4, medianDom: 21 }],
    marketAlert: null, observedAt: new Date("2026-07-31T00:00:00Z"),
  });
  assert.equal(drafts.some((signal) => signal.signalType === "rent_below_comps"), false);
  assert.equal(drafts.some((signal) => signal.signalType === "segment_rent_psf_above_comps"), true);
  assert.match(drafts.find((signal) => signal.category === "performance")?.headline ?? "", /2-bedroom/);
});

test("bedroom-segment migration is additive", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260810260000_portfolio_iq_comp_segments/migration.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqCompSegment"/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
});

test("Portfolio Watch market alerts require a bedroom observed at the subject", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/portfolio-iq/watch.server.ts"), "utf8");
  assert.match(source, /observations\.some\(\(row\) => row\.bedrooms === alert\.bedrooms\)/);
});

test("Today ranks one issue per asset and keeps readiness from crowding out decisions", () => {
  const candidates = [
    { id: "a-performance", assetId: "a", category: "performance", severity: "high", rankScore: 96, evidence: "{}" },
    { id: "a-market", assetId: "a", category: "market", severity: "high", rankScore: 92, evidence: "{}" },
    { id: "b-market", assetId: "b", category: "market", severity: "high", rankScore: 90, evidence: "{}" },
    { id: "c-ready", assetId: "c", category: "readiness", severity: "info", rankScore: 80, evidence: "{}" },
    { id: "d-ready", assetId: "d", category: "readiness", severity: "info", rankScore: 79, evidence: "{}" },
    { id: "e-market", assetId: "e", category: "market", severity: "medium", rankScore: 70, evidence: "{}" },
  ];
  assert.deepEqual(selectTodaySignals(candidates, 4).map((signal) => signal.id), ["a-performance", "b-market", "c-ready", "e-market"]);
});

test("Today safely reads segment evidence without trusting malformed JSON", () => {
  assert.deepEqual(parseTodaySignalEvidence('{"bedrooms":2,"observations":50,"alertId":"alert-1"}'), {
    bedrooms: 2, observations: 50, alertId: "alert-1",
  });
  assert.deepEqual(parseTodaySignalEvidence("not-json"), { bedrooms: null, observations: null, alertId: null });
});

test("Today is protected alongside the existing owner workspace", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/auth/protected-routes.ts"), "utf8");
  assert.match(source, /"\/today"/);
  assert.match(source, /"\/today\/:path\*"/);
});
