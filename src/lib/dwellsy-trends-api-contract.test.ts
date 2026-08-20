import assert from "node:assert/strict";
import test from "node:test";

import fixture from "@/lib/dwellsy-source/trends-api-contract.fixture.json";
import {
  assessDwellsyTrendCoverage,
  buildDwellsyTrendSyncPlan,
  DWELLSY_SOURCE_CAPABILITIES,
  DWELLSY_TRENDS_FIELD_SEMANTICS,
  mapDwellsyRentTrendsEnvelope,
  parseDwellsyRentTrendsEnvelope,
} from "@/lib/dwellsy-source/trends-api-contract";
import { MARKET_IQ_REPORT_CITIES, MARKET_IQ_REPORT_ZIPS } from "@/lib/market-iq/report/scope";

test("maps a real Cleveland response without re-deriving source-provided YoY", () => {
  const series = mapDwellsyRentTrendsEnvelope(fixture.detail, "2026-06-01");
  assert.equal(series.length, 6);

  const twoBedroomHouse = series.find((item) => item.propertyType === "house" && item.bedrooms === 2);
  assert.ok(twoBedroomHouse);
  assert.deepEqual(twoBedroomHouse.points.at(-1), {
    rent: 1168,
    yearOverYearPct: 2.3,
    observations: 58,
    month: "2026-06-01",
    valueBasis: "trends_value",
  });
  assert.deepEqual(DWELLSY_TRENDS_FIELD_SEMANTICS.rent_change_percentage, {
    interpretation: "year_over_year",
    valuePolicy: "preserve_source_value",
    derivationAllowed: false,
    documentationStatus: "source_confirmation_pending",
  });
});

test("fails closed when the required month lacks a detail segment", () => {
  const incomplete = structuredClone(fixture.detail);
  incomplete.response.rent_stats = incomplete.response.rent_stats.filter((row) => !(
    row.month === "2026-06-01" && row.address_type === "House" && row.bedrooms === 4
  ));
  const parsed = parseDwellsyRentTrendsEnvelope(incomplete);
  assert.deepEqual(assessDwellsyTrendCoverage(parsed, "2026-06-01").missingSegments, ["house:4"]);
  assert.throws(
    () => mapDwellsyRentTrendsEnvelope(incomplete, "2026-06-01"),
    /coverage is incomplete/,
  );
});

test("rejects rows outside the exact query identity", () => {
  const wrongIdentity = structuredClone(fixture.detail);
  wrongIdentity.response.location = "18140";
  assert.throws(() => parseDwellsyRentTrendsEnvelope(wrongIdentity), /identity does not match/);

  const wrongPeriod = structuredClone(fixture.detail);
  wrongPeriod.response.rent_stats[0].month = "2025-05-01";
  assert.throws(() => parseDwellsyRentTrendsEnvelope(wrongPeriod), /outside the requested period/);

  const wrongBedroom = parseDwellsyRentTrendsEnvelope(structuredClone(fixture.rollupProbe));
  wrongBedroom.response.rent_stats.push({
    month: "2026-06-01",
    bedrooms: 2,
    address_type: "House",
    count: 1,
    trends_value: 1000,
    rent_change_percentage: 0,
  });
  assert.throws(() => parseDwellsyRentTrendsEnvelope(wrongBedroom), /does not match the request/);
});

test("rejects malformed and ambiguous source rows", () => {
  const malformed = structuredClone(fixture.detail);
  malformed.response.rent_stats[0].trends_value = -1;
  assert.throws(() => parseDwellsyRentTrendsEnvelope(malformed));

  const duplicate = structuredClone(fixture.detail);
  duplicate.response.rent_stats.push(structuredClone(duplicate.response.rent_stats[0]));
  assert.throws(() => parseDwellsyRentTrendsEnvelope(duplicate), /duplicate row/);
});

test("does not synthesize all-bedroom rollups when the source returns none", () => {
  const rollupProbe = parseDwellsyRentTrendsEnvelope(fixture.rollupProbe);
  assert.equal(rollupProbe.response.rent_stats.length, 0);
  assert.throws(
    () => mapDwellsyRentTrendsEnvelope(fixture.rollupProbe, "2026-06-01"),
    /apartment:0.*house:4/,
  );
});

test("counts the full Cleveland snapshot sync and reports the parity gap", () => {
  const plan = buildDwellsyTrendSyncPlan({
    msa: { type: "msa", location: "17460", geographyLabel: "Cleveland-Elyria, OH MSA" },
    cities: MARKET_IQ_REPORT_CITIES.map((city) => ({
      type: "city",
      location: `${city}, OH`,
      geographyLabel: city,
    })),
    zipCodes: MARKET_IQ_REPORT_ZIPS.map((zip) => ({
      type: "zip",
      location: zip,
      geographyLabel: zip,
    })),
    startDate: "2025-06-01",
    endDate: "2026-06-01",
  });
  assert.equal(plan.geographyCount, 111);
  assert.equal(plan.executableDetailCallCount, 111);
  assert.equal(plan.requiredRollupCallCount, 111);
  assert.equal(plan.fullParityCallCount, 222);
  assert.equal(plan.parityReady, false);
  assert.equal(plan.deliveryMode, "deliberate_snapshot_sync");
  assert.equal(plan.pageRenderFetchAllowed, false);
  assert.deepEqual(plan.missingCapabilities, ["apartment:999", "house:999"]);
  assert.equal(plan.executableCalls[1].request.location, "Cleveland, OH");
});

test("freezes the three-consumer capability inventory", () => {
  assert.equal(DWELLSY_SOURCE_CAPABILITIES.detailedRentTrends.status, "covered");
  assert.equal(DWELLSY_SOURCE_CAPABILITIES.allBedroomRollups.status, "unsupported");
  assert.equal(DWELLSY_SOURCE_CAPABILITIES.activeListings.status, "partial");
  assert.equal(DWELLSY_SOURCE_CAPABILITIES.listingEvents.status, "unsupported");
});
