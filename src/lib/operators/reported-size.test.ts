import test from "node:test";
import { strict as assert } from "node:assert";
import {
  parseReportedSizeInput,
  reportedVsEstimateRatio,
  formatRatio,
  isReportedSizeSourceKind,
  REPORTED_SIZE_SOURCE_KINDS,
  MAX_REPORTED_UNITS,
} from "./reported-size";

const NOW = new Date("2026-08-07T12:00:00.000Z");

function parse(over: Partial<Parameters<typeof parseReportedSizeInput>[0]> = {}) {
  return parseReportedSizeInput({
    reportedUnits: "3000",
    reportedAsOf: "2026-08-07",
    sourceKind: "ceo_call",
    sourceNote: "",
    now: NOW,
    ...over,
  });
}

test("accepts a well-formed count and normalises it", () => {
  const r = parse();
  assert.ok(r.ok);
  assert.equal(r.value.reportedUnits, 3000);
  assert.equal(r.value.sourceKind, "ceo_call");
  // An empty note is null, not "" — the column is nullable and a blank string
  // would render as an empty line in the admin table and the CSV.
  assert.equal(r.value.sourceNote, null);
});

test("tolerates the way people actually type unit counts", () => {
  // "3,000" and " 3000 " are what gets pasted out of an email.
  for (const raw of ["3,000", " 3000 ", "3 000"]) {
    const r = parse({ reportedUnits: raw });
    assert.ok(r.ok, `${raw} should parse`);
    assert.equal(r.value.reportedUnits, 3000);
  }
});

test("rejects counts that can't be a portfolio", () => {
  for (const raw of ["0", "-5", "abc", "", "12.5"]) {
    assert.equal(parse({ reportedUnits: raw }).ok, false, `${raw} should be rejected`);
  }
});

test("rejects an implausible count as a typo, not as an operator's answer", () => {
  const r = parse({ reportedUnits: String(MAX_REPORTED_UNITS + 1) });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /typo/);
});

test("as-of date is required and cannot be in the future", () => {
  assert.equal(parse({ reportedAsOf: "" }).ok, false);
  assert.equal(parse({ reportedAsOf: "not-a-date" }).ok, false);
  // A future date would silently outrank every real count in any
  // recency-weighted calibration.
  assert.equal(parse({ reportedAsOf: "2027-01-01" }).ok, false);
  // Today is fine, and so is a count from a call last quarter.
  assert.equal(parse({ reportedAsOf: "2026-08-07" }).ok, true);
  assert.equal(parse({ reportedAsOf: "2026-02-01" }).ok, true);
});

test("as-of parses as UTC midnight so it can't drift a day west of GMT", () => {
  const r = parse({ reportedAsOf: "2026-08-07" });
  assert.ok(r.ok);
  assert.equal(r.value.reportedAsOf.toISOString(), "2026-08-07T00:00:00.000Z");
});

test("source kind must be one of the known set", () => {
  assert.equal(parse({ sourceKind: "hearsay" }).ok, false);
  for (const k of REPORTED_SIZE_SOURCE_KINDS) {
    assert.equal(parse({ sourceKind: k }).ok, true, k);
    assert.equal(isReportedSizeSourceKind(k), true);
  }
  assert.equal(isReportedSizeSourceKind("hearsay"), false);
  assert.equal(isReportedSizeSourceKind(null), false);
});

test("ratio measures how far our estimate sits from what they report", () => {
  // The two real calibration points that prompted this feature.
  assert.equal(reportedVsEstimateRatio(1400, 790)?.toFixed(1), "1.8"); // Fischer
  assert.equal(reportedVsEstimateRatio(3000, 803)?.toFixed(1), "3.7"); // IPS
  assert.equal(formatRatio(reportedVsEstimateRatio(3000, 803)), "3.7× our estimate");
});

test("ratio is null rather than 0 or Infinity when there's nothing to compare", () => {
  // A caller must render the absence; a 0 would read as "we're spot on" and an
  // Infinity would read as a catastrophic miss. Both would be fabrications.
  assert.equal(reportedVsEstimateRatio(3000, null), null);
  assert.equal(reportedVsEstimateRatio(3000, 0), null);
  assert.equal(reportedVsEstimateRatio(3000, undefined), null);
  assert.equal(reportedVsEstimateRatio(3000, Number.NaN), null);
  assert.equal(formatRatio(null), null);
});
