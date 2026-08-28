import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Market IQ internal routes replace customer navigation with admin tools", () => {
  const navigation = readFileSync("src/components/market-iq/MarketIqAppNavigation.tsx", "utf8");
  assert.match(navigation, /pathname\.startsWith\("\/market-iq\/internal\/"\)/);
  assert.match(navigation, /Market IQ administration/);
  assert.match(navigation, /Admin overview/);
  assert.match(navigation, /Operations readiness/);
  assert.match(navigation, /Data loading/);
  assert.match(navigation, /Pilot telemetry/);
});

test("the admin overview presents readiness and data loading as first-class tools", () => {
  const admin = readFileSync("src/app/market-iq/internal/admin/page.tsx", "utf8");
  assert.match(admin, /Operations control center/);
  assert.match(admin, /href="\/market-iq\/internal\/readiness"/);
  assert.match(admin, /href="\/market-iq\/internal\/data-operations"/);
  assert.match(admin, /deployment identity, configuration, source evidence/i);
  assert.match(admin, /seven-day completeness for the 25-market cohort/i);
});
