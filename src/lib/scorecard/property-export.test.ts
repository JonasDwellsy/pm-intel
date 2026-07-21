// Test coverage for the Properties xlsx export (Task 5). Mirrors
// src/lib/watch-list/export.test.ts's approach: build a workbook in-memory
// and inspect it via XLSX.utils.sheet_to_json rather than touching the
// filesystem.

import test from "node:test";
import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import { buildPropertyWorkbook, type PropertyHomeRow } from "./property-export";
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

// --- Homes sheet (Task 5: per-home rows from the PropertyHome table) ------

const HOMES: PropertyHomeRow[] = [
  {
    address: "12 Oak St",
    submarket: "North Suburbs",
    bedrooms: 3,
    medianRentT12: 1450,
    domT12: 25,
    lastListedDate: new Date("2026-06-01"),
    nListings: 2,
    concession: true,
  },
  {
    address: "88 Elm Ave",
    submarket: null,
    bedrooms: null,
    medianRentT12: null,
    domT12: null,
    lastListedDate: null,
    nListings: 0,
    concession: false,
  },
];

test("workbook gets a 'Homes' sheet appended when homes rows are passed", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL), HOMES);
  assert.deepEqual(workbook.SheetNames, ["Properties", "Homes"]);
});

test("no 'Homes' sheet when the homes array is empty", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL), []);
  assert.deepEqual(workbook.SheetNames, ["Properties"]);
});

test("no 'Homes' sheet when homes is omitted entirely (default param)", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL));
  assert.deepEqual(workbook.SheetNames, ["Properties"]);
});

test("Homes sheet header has Address + no score/star/percentile/rank column", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL), HOMES);
  const aoa = XLSX.utils.sheet_to_json<Array<string>>(workbook.Sheets["Homes"], {
    header: 1,
  });
  assert.deepEqual(aoa[0], [
    "Address",
    "Submarket",
    "Beds",
    "Median Rent",
    "Median DOM",
    "Last Listed",
    "N Listings",
    "Concession",
  ]);
  assert.ok(
    !aoa[0].some((h) => /score|star|percentile|rank/i.test(h)),
    `unexpected scoring column in Homes header: ${aoa[0].join(", ")}`
  );
  assert.ok(
    !aoa[0].some((h) => /bathroom/i.test(h)),
    `unexpected bathrooms column in Homes header: ${aoa[0].join(", ")}`
  );
});

test("Homes sheet rows carry per-home fields, with the date formatted YYYY-MM-DD", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL), HOMES);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Homes"]);
  assert.equal(rows.length, 2);
  const oak = rows.find((r) => r["Address"] === "12 Oak St");
  assert.ok(oak, "12 Oak St row should be present");
  assert.equal(oak!["Submarket"], "North Suburbs");
  assert.equal(oak!["Beds"], 3);
  assert.equal(oak!["Median Rent"], 1450);
  assert.equal(oak!["Median DOM"], 25);
  assert.equal(oak!["Last Listed"], "2026-06-01");
  assert.equal(oak!["N Listings"], 2);
  assert.equal(oak!["Concession"], "Yes");
});

test("Homes sheet renders null fields blank and concession=false as an empty cell", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(PROPERTY_DETAIL), HOMES);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Homes"]);
  const elm = rows.find((r) => r["Address"] === "88 Elm Ave");
  assert.ok(elm, "88 Elm Ave row should be present");
  assert.equal(elm!["Submarket"], undefined);
  assert.equal(elm!["Beds"], undefined);
  assert.equal(elm!["Median Rent"], undefined);
  assert.equal(elm!["Median DOM"], undefined);
  assert.equal(elm!["Last Listed"], undefined);
  assert.equal(elm!["N Listings"], 0);
  assert.equal(elm!["Concession"], ""); // false → empty-string cell (present, not "No")
});

test("Homes sheet is appended even when propertyDetail is absent (homes-only export)", () => {
  const { workbook } = buildPropertyWorkbook(makeScorecard(undefined), HOMES);
  assert.deepEqual(workbook.SheetNames, ["Properties", "Homes"]);
});
