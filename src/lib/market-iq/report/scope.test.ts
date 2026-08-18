import assert from "node:assert/strict";
import test from "node:test";

import { parseMarketIqSetupScopeFormData } from "@/lib/market-iq/report/scope";

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
