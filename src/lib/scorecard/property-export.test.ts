// Test coverage for the Properties xlsx export (Task 5). Mirrors
// src/lib/watch-list/export.test.ts's approach: build a workbook in-memory
// and inspect it via XLSX.utils.sheet_to_json rather than touching the
// filesystem.

import test from "node:test";
import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import { buildPropertyWorkbook } from "./property-export";
import type { PropertyDetailBlock, ScorecardData } from "@/lib/types";

const PROPERTY_DETAIL: PropertyDetailBlock = {
  properties: [
    {
      kind: "community",
      label: "The Oaks",
      submarket: null,
      units: 120,
      homes: null,
      nListings: 18,
      medianDomT12: 22,
      medianRentT12: 1450,
      rentYoY: 0.04,
      concessionRate: 0.1,
      listingQuality: 78,
    },
    {
      kind: "sfr-submarket",
      label: "North Suburbs",
      submarket: "North Suburbs",
      units: null,
      homes: 34,
      nListings: 41,
      medianDomT12: 35,
      medianRentT12: 1900,
      rentYoY: -0.01,
      concessionRate: 0.25,
      listingQuality: 55,
    },
  ],
  comps: {
    medianDomT12: 29,
    medianRentT12: 1510,
    rentYoY: 0.021,
    concessionRate: 0.18,
  },
};

function makeScorecard(propertyDetail?: PropertyDetailBlock): ScorecardData {
  return {
    dataAsOf: "2026-06-15",
    pm: { name: "Ark Homes For Rent", slug: "ark-homes-for-rent" },
    propertyDetail,
  } as unknown as ScorecardData;
}

test("buildPropertyWorkbook produces a single 'Properties' sheet", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  assert.deepEqual(workbook.SheetNames, ["Properties"]);
});

test("header row matches the specified property + MSA-comp columns", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  const header = XLSX.utils.sheet_to_json<Array<string>>(
    workbook.Sheets["Properties"],
    { header: 1 }
  )[0];
  assert.deepEqual(header, [
    "Property / Community",
    "Kind",
    "Submarket",
    "Units",
    "Homes",
    "N Listings",
    "Median DOM",
    "Median Rent",
    "Rent YoY %",
    "Concession %",
    "Listing Quality",
    "Mkt Median DOM",
    "Mkt Median Rent",
    "Mkt Rent YoY %",
    "Mkt Concession %",
  ]);
});

test("never includes a score/star/percentile column", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  const header = XLSX.utils.sheet_to_json<Array<string>>(
    workbook.Sheets["Properties"],
    { header: 1 }
  )[0];
  const joined = header.join(" ").toLowerCase();
  assert.ok(!/star|percentile|rank|score/.test(joined), `unexpected scoring column: ${joined}`);
});

test("one data row per property — community row has units set, homes blank", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Properties"]
  );
  assert.equal(rows.length, 2);
  const oaks = rows.find((r) => r["Property / Community"] === "The Oaks");
  assert.ok(oaks, "The Oaks row should be present");
  assert.equal(oaks!["Kind"], "Community");
  assert.equal(oaks!["Submarket"], undefined); // null → blank cell, key absent
  assert.equal(oaks!["Units"], 120);
  assert.equal(oaks!["Homes"], undefined);
  assert.equal(oaks!["N Listings"], 18);
  assert.equal(oaks!["Median DOM"], 22);
  assert.equal(oaks!["Median Rent"], 1450);
  assert.equal(oaks!["Rent YoY %"], 4);
  assert.equal(oaks!["Concession %"], 10);
  assert.equal(oaks!["Listing Quality"], 78);
});

test("sfr-submarket row has homes set, units blank, and carries the submarket label", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Properties"]
  );
  const north = rows.find((r) => r["Property / Community"] === "North Suburbs");
  assert.ok(north, "North Suburbs row should be present");
  assert.equal(north!["Kind"], "SFR Submarket");
  assert.equal(north!["Submarket"], "North Suburbs");
  assert.equal(north!["Units"], undefined);
  assert.equal(north!["Homes"], 34);
  assert.equal(north!["N Listings"], 41);
  assert.equal(north!["Median DOM"], 35);
  assert.equal(north!["Median Rent"], 1900);
  assert.equal(north!["Rent YoY %"], -1);
  assert.equal(north!["Concession %"], 25);
});

test("MSA-comp columns are present and repeated identically on every row", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Properties"]
  );
  for (const row of rows) {
    assert.equal(row["Mkt Median DOM"], 29);
    assert.equal(row["Mkt Median Rent"], 1510);
    assert.equal(row["Mkt Rent YoY %"], 2.1);
    assert.equal(row["Mkt Concession %"], 18);
  }
});

test("null property fields render as blank cells, not 0 or the string 'null'", () => {
  const sparse: PropertyDetailBlock = {
    properties: [
      {
        kind: "community",
        label: "Sparse Community",
        submarket: null,
        units: null,
        homes: null,
        nListings: 3,
        medianDomT12: null,
        medianRentT12: null,
        rentYoY: null,
        concessionRate: null,
        listingQuality: null,
      },
    ],
    comps: {
      medianDomT12: null,
      medianRentT12: null,
      rentYoY: null,
      concessionRate: null,
    },
  };
  const { workbook } = buildPropertyWorkbook(makeScorecard(sparse));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Properties"]
  );
  const row = rows[0];
  for (const key of [
    "Submarket",
    "Units",
    "Homes",
    "Median DOM",
    "Median Rent",
    "Rent YoY %",
    "Concession %",
    "Listing Quality",
    "Mkt Median DOM",
    "Mkt Median Rent",
    "Mkt Rent YoY %",
    "Mkt Concession %",
  ]) {
    assert.equal(row[key], undefined, `expected ${key} to render blank, got ${JSON.stringify(row[key])}`);
  }
});

test("empty propertyDetail.properties produces a header-only sheet", () => {
  const empty: PropertyDetailBlock = {
    properties: [],
    comps: { medianDomT12: null, medianRentT12: null, rentYoY: null, concessionRate: null },
  };
  const { workbook } = buildPropertyWorkbook(makeScorecard(empty));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Properties"]
  );
  assert.equal(rows.length, 0);
});

test("filename is built from the operator name + ' properties' suffix and dataAsOf date", () => {
  const { filename } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  assert.equal(filename, "ark-homes-for-rent-properties-2026-06-15.xlsx");
});
