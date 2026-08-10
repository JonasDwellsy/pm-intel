import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildHistoricalListingPulse, historicalWindows, resolveHistoricalAnalysisCutoff } from "./historical";

test("uses the declared analysis cutoff instead of the later download date", () => {
  const downloadDate = new Date("2026-08-07T00:00:00.000Z");
  assert.equal(
    resolveHistoricalAnalysisCutoff(downloadDate, '{"analysisCutoff":"2026-07-31"}').toISOString(),
    "2026-07-31T00:00:00.000Z"
  );
  assert.equal(resolveHistoricalAnalysisCutoff(downloadDate, "{}").toISOString(), downloadDate.toISOString());
  assert.equal(resolveHistoricalAnalysisCutoff(downloadDate, "invalid").toISOString(), downloadDate.toISOString());
});

test("Cleveland server preserves the July analytical boundary", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/market-iq/historical.server.ts"), "utf8");
  assert.match(source, /CLEVELAND_DECLARED_ANALYSIS_CUTOFF = new Date\("2026-07-31T00:00:00\.000Z"\)/);
  assert.match(source, /Math\.min\(metadataCutoff\.getTime\(\), CLEVELAND_DECLARED_ANALYSIS_CUTOFF\.getTime\(\)\)/);
});

test("uses an inclusive 30-day UTC window", () => {
  const windows = historicalWindows(new Date("2026-08-07T00:00:00.000Z"));
  assert.equal(windows.currentStart.toISOString(), "2026-07-09T00:00:00.000Z");
  assert.equal(windows.priorStart.toISOString(), "2026-06-09T00:00:00.000Z");
  assert.equal(windows.cutoffEnd.toISOString(), "2026-08-07T23:59:59.999Z");
});

test("derives market and city metrics from imported listings", () => {
  const pulse = buildHistoricalListingPulse({
    availableThrough: new Date("2026-08-07T00:00:00.000Z"),
    recordCount: 4,
    activeListings: [
      { city: "Cleveland", askingRent: 1_000, squareFeet: 1_000, activatedAt: new Date("2026-07-09T00:00:00.000Z") },
      { city: "Cleveland", askingRent: 1_500, squareFeet: 1_000, activatedAt: new Date("2026-07-29T00:00:00.000Z") },
    ],
    recentListings: [
      { city: "Cleveland", activatedAt: new Date("2026-07-09T00:00:00.000Z") },
      { city: "Cleveland", activatedAt: new Date("2026-08-07T10:00:00.000Z") },
      { city: "Cleveland", activatedAt: new Date("2026-06-20T00:00:00.000Z") },
    ],
  });
  assert.equal(pulse.historical.activeAtCutoff, 2);
  assert.equal(pulse.historical.newListings30d, 2);
  assert.equal(pulse.historical.newListingsChange, 100);
  assert.equal(pulse.historical.medianRentPerSqFt, 1.25);
  assert.equal(pulse.places[0].name, "Cleveland");
});
