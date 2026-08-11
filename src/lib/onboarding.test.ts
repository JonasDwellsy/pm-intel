import assert from "node:assert/strict";
import test from "node:test";
import { parseManualPropertyLines, parseSpreadsheetRows } from "@/lib/portfolio-iq/onboarding";

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
