import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportAccessReason,
  isReportAccessible,
  type ReportAccessInputs,
} from "./report-entitlements";

const NONE: ReportAccessInputs = {
  isAdmin: false,
  marketEntitled: false,
  hasReportPurchase: false,
  hasActiveMarketPass: false,
};

test("no signals → no access", () => {
  assert.equal(reportAccessReason(NONE), null);
  assert.equal(isReportAccessible(NONE), false);
});

test("admin bypass wins over everything", () => {
  assert.equal(reportAccessReason({ ...NONE, isAdmin: true }), "admin");
});

test("existing market entitlement is honored (non-breaking B2B path)", () => {
  assert.equal(reportAccessReason({ ...NONE, marketEntitled: true }), "market");
  assert.equal(isReportAccessible({ ...NONE, marketEntitled: true }), true);
});

test("per-report purchase grants access", () => {
  assert.equal(reportAccessReason({ ...NONE, hasReportPurchase: true }), "report");
});

test("active market pass / subscription grants access", () => {
  assert.equal(reportAccessReason({ ...NONE, hasActiveMarketPass: true }), "pass");
});

test("precedence: market beats report beats pass", () => {
  assert.equal(
    reportAccessReason({
      isAdmin: false,
      marketEntitled: true,
      hasReportPurchase: true,
      hasActiveMarketPass: true,
    }),
    "market"
  );
  assert.equal(
    reportAccessReason({
      isAdmin: false,
      marketEntitled: false,
      hasReportPurchase: true,
      hasActiveMarketPass: true,
    }),
    "report"
  );
});
