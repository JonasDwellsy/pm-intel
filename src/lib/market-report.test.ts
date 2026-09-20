import assert from "node:assert/strict";
import test from "node:test";

import {
  marketReportRequestSchema,
  normalizeMarketReportEmail,
} from "./market-report";

test("market report request accepts a valid market and email", () => {
  const result = marketReportRequestSchema.safeParse({
    marketId: "denver-co",
    email: "Owner@Example.com ",
    source: "homepage_exit_intent",
  });
  assert.equal(result.success, true);
});

test("market report request rejects malformed email and missing market", () => {
  assert.equal(
    marketReportRequestSchema.safeParse({ marketId: "", email: "not-email" })
      .success,
    false
  );
});

test("market report email is normalized before persistence", () => {
  assert.equal(
    normalizeMarketReportEmail("  Owner+Denver@Example.COM "),
    "owner+denver@example.com"
  );
});
