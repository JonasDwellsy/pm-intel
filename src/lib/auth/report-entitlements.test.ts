import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportAccessReason,
  isReportAccessible,
  type ReportAccessInputs,
} from "./report-entitlements";

// v0.33 — THREE ways to reach a report, not four. The `hasActiveMarketPass`
// input is gone with the market-pass and subscription SKUs. It is worth
// stating why in a test: `Subscription` carried no marketId and the server
// resolver filtered only on status and period end, so a single $19/month
// subscription granted every operator in all 44 markets. Removing the input
// removes the possibility.

const NONE: ReportAccessInputs = {
  isAdmin: false,
  marketEntitled: false,
  hasReportPurchase: false,
};

test("no signals → no access", () => {
  assert.equal(reportAccessReason(NONE), null);
  assert.equal(isReportAccessible(NONE), false);
});

test("admin bypass wins over everything", () => {
  assert.equal(reportAccessReason({ ...NONE, isAdmin: true }), "admin");
  assert.equal(
    reportAccessReason({
      isAdmin: true,
      marketEntitled: true,
      hasReportPurchase: true,
    }),
    "admin"
  );
});

test("the existing B2B market entitlement outranks a consumer purchase", () => {
  assert.equal(
    reportAccessReason({ ...NONE, marketEntitled: true, hasReportPurchase: true }),
    "market"
  );
});

test("a per-PM purchase grants access on its own", () => {
  assert.equal(reportAccessReason({ ...NONE, hasReportPurchase: true }), "report");
  assert.equal(isReportAccessible({ ...NONE, hasReportPurchase: true }), true);
});

test("there is no pass reason any more", () => {
  // A stray "pass" would mean a market-wide consumer grant came back.
  const reasons = [
    reportAccessReason(NONE),
    reportAccessReason({ ...NONE, isAdmin: true }),
    reportAccessReason({ ...NONE, marketEntitled: true }),
    reportAccessReason({ ...NONE, hasReportPurchase: true }),
  ];
  assert.deepEqual(reasons, [null, "admin", "market", "report"]);
});
