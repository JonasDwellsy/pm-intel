import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMarketIqSegmentSelection,
  parseMarketIqSetupScopeFormData,
  toggleMarketIqSegmentSelection,
} from "@/lib/market-iq/report/scope";

test("aggregate product selections replace bedroom-level selections", () => {
  assert.deepEqual(
    toggleMarketIqSegmentSelection(["house:2", "house:3", "apartment:1"], "house:999"),
    ["apartment:1", "house:999"],
  );
});

test("bedroom-level selections replace the aggregate for that product", () => {
  assert.deepEqual(
    toggleMarketIqSegmentSelection(["house:999", "apartment:999"], "house:4"),
    ["apartment:999", "house:4"],
  );
});

test("legacy contradictory selections keep the more specific bedroom choices", () => {
  assert.deepEqual(
    normalizeMarketIqSegmentSelection(["house:999", "house:2", "house:3", "apartment:999"]),
    ["house:2", "house:3", "apartment:999"],
  );
});

test("Columbus setup keeps Columbus geography instead of applying Cleveland defaults", () => {
  const formData = new FormData();
  formData.append("cities", "Columbus");
  formData.append("zipCodes", "43215");
  formData.append("segments", "apartment:1");

  assert.deepEqual(parseMarketIqSetupScopeFormData(formData, "columbus-oh"), {
    cities: ["Columbus"],
    zipCodes: ["43215"],
    segments: ["apartment:1"],
  });
});

test("setup rejects a ZIP from a different entitled market", () => {
  const formData = new FormData();
  formData.append("cities", "Columbus");
  formData.append("zipCodes", "44113");
  formData.append("segments", "house:3");

  assert.deepEqual(parseMarketIqSetupScopeFormData(formData, "columbus-oh"), {
    cities: ["Columbus"],
    zipCodes: [],
    segments: ["house:3"],
  });
});
