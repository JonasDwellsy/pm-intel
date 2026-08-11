import assert from "node:assert/strict";
import test from "node:test";
import {
  activationTaskTypes,
  normalizeOnboardingAssetType,
  onboardingAssetSlug,
  parseManualPropertyLines,
  parseSpreadsheetRows,
} from "@/lib/portfolio-iq/onboarding";

test("manual onboarding intake keeps one property per line and removes duplicates", () => {
  const rows = parseManualPropertyLines("21480 Sheldon Rd, Brook Park, OH\n- 398 W Bagley Rd, Berea, OH\n21480 Sheldon Rd, Brook Park, OH");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].addressLine, "398 W Bagley Rd, Berea, OH");
});

test("spreadsheet intake accepts friendly headers and preserves useful details", () => {
  const rows = parseSpreadsheetRows([{ "Property Name": "Acadian", Address: "21480 Sheldon Rd", City: "Brook Park", State: "OH", ZIP: "44142", Units: 88, "Property Type": "Multifamily" }]);
  assert.deepEqual(rows[0], {
    propertyName: "Acadian",
    addressLine: "21480 Sheldon Rd, Brook Park, OH, 44142",
    city: "Brook Park",
    state: "OH",
    postalCode: "44142",
    unitCount: 88,
    assetType: "Multifamily",
    sourceKind: "spreadsheet",
  });
});

test("assisted-onboarding migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260810290000_portfolio_iq_assisted_onboarding/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqOnboardingRequest"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("intake review normalizes product types and creates stable property slugs", () => {
  assert.equal(normalizeOnboardingAssetType("SFR"), "single_family");
  assert.equal(normalizeOnboardingAssetType("Apartment"), "multifamily");
  assert.equal(onboardingAssetSlug("Villas of Fox Hollow, Building A"), "villas-of-fox-hollow-building-a");
});

test("promotion creates only the activation work still required", () => {
  assert.deepEqual(activationTaskTypes({ matched: true, hasObservedOperator: true }), ["issue_uru", "comp_setup", "customer_confirmation"]);
  assert.deepEqual(activationTaskTypes({ matched: false, hasObservedOperator: false }), ["match_review", "issue_uru", "operator_outreach", "comp_setup", "customer_confirmation"]);
});

test("intake workbench migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260811020000_portfolio_iq_intake_workbench/migration.sql", "utf8");
  assert.match(sql, /ALTER TABLE "PortfolioIqOnboardingProperty"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});
