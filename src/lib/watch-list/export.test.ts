// v0.12 — Excel export coverage. The XLSX builder is sync + pure
// (no DOM, no fetch), so we can construct ResultRowVMs in-memory
// and inspect the resulting workbook via XLSX.utils.sheet_to_json.
// Each test asserts a single property of the produced workbook so
// failures point at the exact aspect that regressed.

import test from "node:test";
import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import {
  buildWorkbook,
  buildFilename,
  slugifyForFilename,
  type ExportWatchList,
} from "./export";
import type { ResultRowVM } from "./results-view";
import type { PMRecord } from "./fields";

// ─── Test fixture helpers ────────────────────────────────────────

function makePmRecord(opts: {
  slug: string;
  name: string;
  marketId: string;
  urusT12: number;
  q7?: string;
  domT12?: number;
  concessionRate?: number | null;
  monthsOnPlatform?: number;
}): PMRecord {
  return {
    slug: opts.slug,
    name: opts.name,
    marketId: opts.marketId,
    claimed: false,
    marketCount: 1,
    scorecard: {
      pm: {
        slug: opts.slug,
        name: opts.name,
        quadrant: "Scattered / Independent",
        quadrant7Cell: opts.q7 ?? "SFR Independent",
        hybrid: false,
        institutional: /Institutional/.test(opts.q7 ?? ""),
      },
      market: {
        id: opts.marketId,
        name: opts.marketId,
        state: "TN",
        fullName: `${opts.marketId}, TN MSA`,
      },
      methodologyVersion: "v0.8",
      dataAsOf: "2026-05-19",
      coverage: {
        firstListing: "2024-01-01",
        monthsOnPlatform: opts.monthsOnPlatform ?? 12,
        lifetimeListings: 100,
        t6Listings: null,
        t12Listings: 50,
        urusLifetime: 80,
        urusT12: opts.urusT12,
        activeListings: 12,
        totalObservedUnits: 60,
        nationalObservedUnitsT12: null,
        citiesObserved: 1,
        dataTier: "Full ranking",
        concentratedShare: null,
      },
      geographicCoverage: { citiesText: "", coverageMapPoints: [] },
      classificationRationale: "",
      rank: {
        overall: 5,
        overallTotal: 50,
        quadrant: 2,
        quadrantTotal: 20,
        quadrantMedianDomT12: null,
        composite: null,
        percentiles: {
          dom: null,
          tenancy: null,
          rentPerformance: null,
          marketing: null,
          communityVisibility: null,
        },
        weightingScheme: "with_cv",
      },
      performance: {
        domT12: opts.domT12 ?? 42,
        domT12N: 10,
        domLifetime: 45,
        houseDomT12: null,
        houseUrusT12: 0,
        houseEligible: false,
        aptDomT12: null,
        aptUrusT12: 0,
        aptEligible: false,
        peerQuadrantDomT12: null,
        peerQuadrantDomLifetime: null,
        marketDomT12: 40,
        marketDomLifetime: 42,
      },
      rentTrajectory: [],
      rentPerformance: null,
      marketing: {
        completeness: 0,
        amenitiesMentioned: 0,
        descLen: 0,
        completenessScore: 0,
        amenitiesScore: 0,
        descScore: 0,
        medianPhotosT12: null,
        zeroPhotoT12: null,
        compositeScore: 50,
      },
      tenancy: {
        totalUnits: 0,
        multiEpisodeUnits: 0,
        multiEpisodePct: 0,
        overallGap: null,
        tenancyPercentile: null,
        apartment: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
        house: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
      },
      communityVisibility: null,
      concessionRate: opts.concessionRate ?? null,
    } as PMRecord["scorecard"],
  } as PMRecord;
}

function makeRow(opts: {
  rank: number;
  name: string;
  marketLabel: string;
  fitScore: number;
  urusT12: number;
  portfolioPoint?: number | null;
  portfolioLow?: number | null;
  portfolioHigh?: number | null;
  q7?: string;
  q7Mixed?: boolean;
  listingYoY?: number | null;
  concessionRate?: number | null;
  isMultiMarket?: boolean;
  pmName?: string;
  pmMarketId?: string;
  monthsOnPlatform?: number;
}): ResultRowVM {
  const pm = makePmRecord({
    slug: opts.name.toLowerCase().replace(/\s+/g, "-"),
    name: opts.pmName ?? opts.name,
    marketId: opts.pmMarketId ?? opts.marketLabel,
    urusT12: opts.urusT12,
    q7: opts.q7,
    concessionRate: opts.concessionRate ?? null,
    monthsOnPlatform: opts.monthsOnPlatform,
  });
  return {
    rank: opts.rank,
    id: pm.slug,
    name: opts.name,
    operatorScorecardHref: null,
    isMultiMarket: opts.isMultiMarket ?? false,
    marketCount: opts.isMultiMarket ? 4 : 1,
    marketLabel: opts.marketLabel,
    quadrant7Cell: opts.q7 ?? "SFR Independent",
    quadrant7CellIsMixed: opts.q7Mixed ?? false,
    estimatedPortfolioPoint: opts.portfolioPoint ?? 250,
    estimatedPortfolioLow: opts.portfolioLow ?? 200,
    estimatedPortfolioHigh: opts.portfolioHigh ?? 300,
    estimatedPortfolioConfidence: "Medium",
    urusT12: opts.urusT12,
    listingTrajectoryYoY: opts.listingYoY ?? null,
    concessionRate: opts.concessionRate ?? null,
    fitScore: opts.fitScore,
    pm,
    preferredBreakdown: [],
    requiredBreakdown: [],
    excludedBreakdown: [],
    preferredPassedCount: 0,
    preferredTotalCount: 0,
    drillTargets: [],
  };
}

const SAMPLE_BUYBOX: ExportWatchList = {
  id: "test-bb",
  name: "Scale-Density Rollup",
  description: "Mid-size SFR independent rollup.",
  requiredCriteria: [
    { field: "quadrant7Cell", operator: "eq", value: "SFR Independent" },
  ],
  preferredCriteria: [
    {
      field: "urusT12",
      operator: "between",
      value: [100, 500],
      weight: 0.3,
    },
    { field: "concessionRate", operator: "lte", value: 0.2, weight: 0.3 },
    {
      field: "monthsOnPlatform",
      operator: "gte",
      value: 12,
      weight: 0.2,
    },
  ],
  excludedCriteria: [],
};

function buildSampleWorkbook() {
  return buildWorkbook({
    watchList: SAMPLE_BUYBOX,
    operatorRows: [
      makeRow({
        rank: 1,
        name: "Ark Homes For Rent",
        marketLabel: "BHM, HSV, JAX, KNOX",
        fitScore: 87,
        urusT12: 255,
        portfolioPoint: 1200,
        portfolioLow: 900,
        portfolioHigh: 1500,
        listingYoY: 0.05,
        concessionRate: 0.12,
        isMultiMarket: true,
        monthsOnPlatform: 23,
      }),
      makeRow({
        rank: 2,
        name: "Test PM",
        marketLabel: "Phoenix",
        fitScore: 72,
        urusT12: 180,
        portfolioPoint: 600,
        listingYoY: 0.02,
        concessionRate: 0.08,
        monthsOnPlatform: 18,
      }),
    ],
    marketRows: [
      makeRow({
        rank: 1,
        name: "Ark Homes For Rent",
        marketLabel: "Birmingham, AL",
        fitScore: 85,
        urusT12: 100,
      }),
      makeRow({
        rank: 2,
        name: "Ark Homes For Rent",
        marketLabel: "Jacksonville, FL",
        fitScore: 80,
        urusT12: 80,
      }),
      makeRow({
        rank: 3,
        name: "Test PM",
        marketLabel: "Phoenix",
        fitScore: 72,
        urusT12: 180,
      }),
    ],
    totalCandidates: 694,
    methodologyVersion: "v0.8",
    liveUrl: "https://pm-intel-chi.vercel.app/watch-lists/test-bb/results",
    generatedAt: new Date("2026-05-21T16:30:00Z"),
  });
}

// ─── Filename slugifier ──────────────────────────────────────────

test("slugifyForFilename lowercases + replaces special chars with dashes", () => {
  assert.equal(slugifyForFilename("Scale-Density Rollup"), "scale-density-rollup");
});

test("slugifyForFilename handles parentheses + slashes + colons cleanly", () => {
  assert.equal(slugifyForFilename("Test / Watch List (v2)"), "test-watch-list-v2");
});

test("slugifyForFilename strips leading and trailing dashes", () => {
  assert.equal(slugifyForFilename("  ! ! Trim me ! !  "), "trim-me");
});

test("slugifyForFilename falls back to 'watch-list' when input contains no alphanumerics", () => {
  assert.equal(slugifyForFilename("///"), "watch-list");
  assert.equal(slugifyForFilename(""), "watch-list");
});

test("slugifyForFilename normalizes accents into bare ascii", () => {
  // "Resúmé" → "resume". The slugifier strips diacritics before
  // the [^a-z0-9]+ replacement so accented watch-list names produce
  // readable filenames instead of an unreadable empty stub.
  assert.equal(slugifyForFilename("Résumé Rollup"), "resume-rollup");
});

test("buildFilename composes slug + ISO date + .xlsx", () => {
  const date = new Date("2026-05-21T16:30:00Z");
  assert.equal(
    buildFilename("Scale-Density Rollup", date),
    "scale-density-rollup-2026-05-21.xlsx"
  );
});

// ─── Workbook structure ──────────────────────────────────────────

test("buildWorkbook returns Summary / Operators / Markets in that order", () => {
  const { workbook } = buildSampleWorkbook();
  assert.deepEqual(workbook.SheetNames, ["Summary", "Operators", "Markets"]);
});

test("buildWorkbook filename matches the slug-date-xlsx pattern", () => {
  const { filename } = buildSampleWorkbook();
  assert.equal(filename, "scale-density-rollup-2026-05-21.xlsx");
});

// ─── Summary sheet ───────────────────────────────────────────────

test("Summary sheet carries watch list name, description, methodology version, and live URL", () => {
  const { workbook } = buildSampleWorkbook();
  const sheet = workbook.Sheets["Summary"];
  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, {
    header: 1,
  });
  // Flatten to a label→value map for the rows we care about. The
  // sheet structure puts each labelled value on its own row with
  // label in col A + value in col B.
  const map: Record<string, string | number> = {};
  for (const row of rows) {
    if (row.length >= 2 && typeof row[0] === "string") {
      map[row[0]] = row[1];
    }
  }
  assert.equal(map["Watch list name"], "Scale-Density Rollup");
  assert.equal(map["Description"], "Mid-size SFR independent rollup.");
  assert.equal(map["Methodology version"], "v0.8");
  assert.equal(map["Total operators evaluated"], 694);
  assert.equal(map["Operators matched"], 2);
  assert.equal(map["Match rate"], "0.3%");
  assert.equal(
    map["Live results page"],
    "https://pm-intel-chi.vercel.app/watch-lists/test-bb/results"
  );
});

test("Summary sheet renders each required + preferred criterion in human-readable form", () => {
  const { workbook } = buildSampleWorkbook();
  const sheet = workbook.Sheets["Summary"];
  const lines = XLSX.utils
    .sheet_to_json<Array<string>>(sheet, { header: 1 })
    .flat()
    .filter((s): s is string => typeof s === "string");
  const joined = lines.join(" | ");
  // The formatter composes "{label} {operator phrase} {value}",
  // optionally with " (weight: X)" for preferred criteria. Spot-
  // check one of each so a regression in either path surfaces.
  assert.ok(
    joined.includes("Operator type is SFR Independent"),
    "expected the required quadrant7Cell criterion to render"
  );
  assert.ok(
    joined.includes("Concession frequency is at most 20%"),
    "expected the preferred concessionRate criterion to render as a percent"
  );
  assert.ok(
    /weight: 0\.3/.test(joined),
    "expected the preferred criterion weight callout to render"
  );
});

// ─── Operators sheet ─────────────────────────────────────────────

test("Operators sheet aggregates rows — Ark appears once with markets joined", () => {
  const { workbook } = buildSampleWorkbook();
  const sheet = workbook.Sheets["Operators"];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  assert.equal(rows.length, 2);
  const ark = rows.find((r) => r["Operator"] === "Ark Homes For Rent");
  assert.ok(ark, "Ark row should appear");
  assert.equal(ark["Markets"], "BHM, HSV, JAX, KNOX");
  assert.equal(ark["URUs T12"], 255);
  assert.equal(ark["Est. Portfolio"], 1200);
  assert.equal(ark["Est. Portfolio Low"], 900);
  assert.equal(ark["Est. Portfolio High"], 1500);
  assert.equal(ark["Fit Score"], 87);
});

test("Operators sheet appends 7-Cell (Mixed) suffix when member markets disagree", () => {
  const wb = buildWorkbook({
    watchList: SAMPLE_BUYBOX,
    operatorRows: [
      makeRow({
        rank: 1,
        name: "Mixed Op",
        marketLabel: "M1, M2",
        fitScore: 60,
        urusT12: 100,
        q7: "SFR Independent",
        q7Mixed: true,
        isMultiMarket: true,
      }),
    ],
    marketRows: [],
    totalCandidates: 100,
    methodologyVersion: "v0.8",
    liveUrl: "https://example.test/watch-lists/x/results",
    generatedAt: new Date("2026-05-21T00:00:00Z"),
  });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.workbook.Sheets["Operators"]
  );
  assert.equal(rows[0]["7-Cell"], "SFR Independent (Mixed)");
});

test("Operators sheet sorted by Fit Score desc regardless of input order", () => {
  const wb = buildWorkbook({
    watchList: SAMPLE_BUYBOX,
    operatorRows: [
      makeRow({ rank: 3, name: "Low", marketLabel: "X", fitScore: 40, urusT12: 50 }),
      makeRow({ rank: 1, name: "High", marketLabel: "Y", fitScore: 90, urusT12: 200 }),
      makeRow({ rank: 2, name: "Mid", marketLabel: "Z", fitScore: 70, urusT12: 120 }),
    ],
    marketRows: [],
    totalCandidates: 100,
    methodologyVersion: "v0.8",
    liveUrl: "https://example.test/watch-lists/x/results",
    generatedAt: new Date("2026-05-21T00:00:00Z"),
  });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.workbook.Sheets["Operators"]
  );
  assert.deepEqual(
    rows.map((r) => r["Operator"]),
    ["High", "Mid", "Low"]
  );
});

// ─── Markets sheet ───────────────────────────────────────────────

test("Markets sheet renders one row per PM-market pair — Ark appears as two rows", () => {
  const { workbook } = buildSampleWorkbook();
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Markets"]
  );
  const arkRows = rows.filter((r) => r["Operator"] === "Ark Homes For Rent");
  assert.equal(arkRows.length, 2);
  // Pre-sort puts the higher-fit-score market first.
  assert.equal(arkRows[0]["Market"], "Birmingham, AL");
  assert.equal(arkRows[0]["Fit Score"], 85);
  assert.equal(arkRows[1]["Market"], "Jacksonville, FL");
  assert.equal(arkRows[1]["Fit Score"], 80);
});

test("Markets sheet sorted by Operator name then Fit Score desc", () => {
  const wb = buildWorkbook({
    watchList: SAMPLE_BUYBOX,
    operatorRows: [],
    marketRows: [
      makeRow({ rank: 3, name: "Zeta", marketLabel: "M", fitScore: 90, urusT12: 50 }),
      makeRow({ rank: 2, name: "Alpha", marketLabel: "X", fitScore: 60, urusT12: 80 }),
      makeRow({ rank: 1, name: "Alpha", marketLabel: "Y", fitScore: 95, urusT12: 70 }),
    ],
    totalCandidates: 100,
    methodologyVersion: "v0.8",
    liveUrl: "https://example.test/watch-lists/x/results",
    generatedAt: new Date("2026-05-21T00:00:00Z"),
  });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.workbook.Sheets["Markets"]
  );
  // Alpha < Zeta alphabetically; within Alpha, fit 95 before 60.
  assert.deepEqual(
    rows.map((r) => `${r["Operator"]}:${r["Fit Score"]}`),
    ["Alpha:95", "Alpha:60", "Zeta:90"]
  );
});

// ─── Adaptive columns ────────────────────────────────────────────

test("Adaptive columns appear in BOTH data sheets when the watch list references a non-always-on field", () => {
  // The SAMPLE_BUYBOX preferred set includes monthsOnPlatform — a
  // field not in ALWAYS_ON_FIELD_IDS. It should surface as a
  // column on both Operators and Markets sheets.
  const { workbook } = buildSampleWorkbook();
  const operatorsHeader = XLSX.utils.sheet_to_json<Array<string>>(
    workbook.Sheets["Operators"],
    { header: 1 }
  )[0];
  const marketsHeader = XLSX.utils.sheet_to_json<Array<string>>(
    workbook.Sheets["Markets"],
    { header: 1 }
  )[0];
  assert.ok(
    operatorsHeader.includes("Platform tenure"),
    `Operators header missing "Platform tenure": ${JSON.stringify(operatorsHeader)}`
  );
  assert.ok(
    marketsHeader.includes("Platform tenure"),
    `Markets header missing "Platform tenure": ${JSON.stringify(marketsHeader)}`
  );
});

test("Adaptive columns dedup — concessionRate appears once (column is the registry label, NOT both 'Concession Rate %' and 'Concession frequency')", () => {
  // The SAMPLE_BUYBOX has a preferred concessionRate criterion.
  // concessionRate isn't in ALWAYS_ON_FIELD_IDS, so it gets an
  // adaptive column ("Concession frequency"). The always-on
  // header for concession is "Concession Rate %" (different
  // label, different field role) — both should appear and
  // shouldn't be confused. This test pins the headers so a
  // future ALWAYS_ON addition doesn't quietly double the column.
  const { workbook } = buildSampleWorkbook();
  const header = XLSX.utils.sheet_to_json<Array<string>>(
    workbook.Sheets["Operators"],
    { header: 1 }
  )[0];
  const concessionColumns = header.filter((h) =>
    /concession/i.test(h ?? "")
  );
  // Expected: "Concession Rate %" (always-on) + "Concession
  // frequency" (adaptive, the registry's label for concessionRate).
  assert.equal(concessionColumns.length, 2);
});

// ─── No-criteria edge case ───────────────────────────────────────

test("Summary sheet shows '(none)' for sections with zero criteria", () => {
  const wb = buildWorkbook({
    watchList: {
      id: "empty",
      name: "Empty BB",
      description: null,
      requiredCriteria: [],
      preferredCriteria: [],
      excludedCriteria: [],
    },
    operatorRows: [],
    marketRows: [],
    totalCandidates: 100,
    methodologyVersion: "v0.8",
    liveUrl: "https://example.test/watch-lists/empty/results",
    generatedAt: new Date("2026-05-21T00:00:00Z"),
  });
  const rows = XLSX.utils
    .sheet_to_json<Array<string>>(wb.workbook.Sheets["Summary"], { header: 1 })
    .flat()
    .filter((s): s is string => typeof s === "string");
  // The "(none)" sentinel should appear in all three sections
  // (required, preferred, excluded). Counting bare occurrences
  // is enough; the section headers themselves carry their own
  // labels so we don't risk confusing one with another here.
  const noneCount = rows.filter((r) => r === "(none)").length;
  assert.equal(noneCount, 3);
});
