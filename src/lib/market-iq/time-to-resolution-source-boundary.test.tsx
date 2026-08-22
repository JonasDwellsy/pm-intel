import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(
  resolve(process.cwd(), "src/lib/dwellsy-source/time-to-resolution.server.ts"),
  "utf8",
);
const contract = readFileSync(
  resolve(process.cwd(), "src/lib/market-iq/time-to-resolution.ts"),
  "utf8",
);
const component = readFileSync(
  resolve(process.cwd(), "src/components/market-iq/report/MarketIqTimeToResolution.tsx"),
  "utf8",
);
const reportContract = readFileSync(
  resolve(process.cwd(), "src/lib/market-iq/report/report.ts"),
  "utf8",
);
const dailyEdition = readFileSync(
  resolve(process.cwd(), "src/app/market-iq/daily/page.tsx"),
  "utf8",
);
const publicReport = readFileSync(
  resolve(process.cwd(), "src/components/market-iq/report/MarketIqPublicReport.tsx"),
  "utf8",
);

describe("time-to-resolution source boundary", () => {
  it("uses inactive lifecycle timestamps rather than the unrelated comps DOM field", () => {
    assert.match(reader, /FROM dwellsy_prod\.property_listing_table listing/);
    assert.match(reader, /listing\.property_listing_status = 'inactive'/);
    assert.match(reader, /listing\.deactivation_time - listing\.creation_time/);
    assert.match(reader, /listing\.deactivation_time >= listing\.creation_time/);
    assert.doesNotMatch(reader, /days_on_market/);
    assert.doesNotMatch(reader, /active_listing_table/);
  });

  it("keeps rent bands descriptive and does not calculate rent trends", () => {
    assert.match(reader, /listing_amount < 1000/);
    assert.match(reader, /listing_amount < 2500/);
    assert.doesNotMatch(reader, /year_over_year|month_over_month|gaussian/i);
  });

  it("keeps the standing section structurally isolated from monthly trend types", () => {
    for (const source of [reader, contract, component]) {
      assert.doesNotMatch(source, /MarketIqTrendPoint|MarketIqTrendSeries/);
      assert.doesNotMatch(source, /from ["']@\/lib\/market-iq\/alerts["']/);
    }
  });

  it("carries explicit availability through both interactive report surfaces", () => {
    assert.match(reportContract, /timeToResolution\?: MarketIqTimeToResolutionAvailability/);
    assert.match(reportContract, /timeToResolution: input\.timeToResolution/);
    assert.match(dailyEdition, /<MarketIqTimeToResolution availability=\{report\.timeToResolution\}/);
    assert.match(publicReport, /<MarketIqTimeToResolution availability=\{report\.timeToResolution\}/);
  });
});
