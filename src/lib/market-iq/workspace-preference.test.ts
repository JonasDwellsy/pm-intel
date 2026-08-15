import assert from "node:assert/strict";
import test from "node:test";
import { defaultMarketIqScopeSelection } from "@/lib/market-iq/report/scope";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";

test("workspace preference falls back to complete Market IQ defaults", () => {
  assert.deepEqual(marketIqSelectionFromPreference(null), defaultMarketIqScopeSelection());
});

test("workspace preference keeps only supported scope values", () => {
  assert.deepEqual(marketIqSelectionFromPreference({
    defaultCities: JSON.stringify(["Cleveland", "Not a city"]),
    defaultZipCodes: JSON.stringify(["44113", "00000"]),
    defaultSegments: JSON.stringify(["apartment:1", "hotel:9"]),
  }), { cities: ["Cleveland"], zipCodes: ["44113"], segments: ["apartment:1"] });
});

test("malformed stored values fail safely to defaults", () => {
  assert.deepEqual(marketIqSelectionFromPreference({
    defaultCities: "not-json",
    defaultZipCodes: "not-json",
    defaultSegments: "not-json",
  }), defaultMarketIqScopeSelection());
});
