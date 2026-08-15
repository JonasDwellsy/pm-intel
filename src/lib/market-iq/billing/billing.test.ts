import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isActiveMarketIqSubscriptionStatus, marketIqPlanPriceLabel } from "./plans";

test("Market IQ paid access recognizes active and grace-period states", () => {
  assert.equal(isActiveMarketIqSubscriptionStatus("active"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("trialing"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("past_due"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("canceled"), false);
  assert.equal(isActiveMarketIqSubscriptionStatus("unpaid"), false);
});

test("single-market pricing is the commercial default", () => {
  assert.equal(marketIqPlanPriceLabel(), "$199");
});

test("commercial migration is additive and isolated from analytical storage", () => {
  const migration = readFileSync("prisma/migrations/20260815090000_market_iq_commercial_provisioning/migration.sql", "utf8");
  const analyticalSchema = readFileSync("prisma/market-iq/schema.prisma", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqSubscription"/);
  assert.match(migration, /CREATE TABLE "MarketIqBillingEvent"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN/);
  assert.doesNotMatch(analyticalSchema, /MarketIqSubscription/);
});

test("Stripe webhook verifies its signature before processing", () => {
  const source = readFileSync("src/app/api/market-iq/billing/webhook/route.ts", "utf8");
  const signature = source.indexOf("constructEvent");
  const ledger = source.indexOf("marketIqBillingEvent.findUnique");
  const process = source.indexOf("await processEvent");
  assert.ok(signature >= 0);
  assert.ok(ledger > signature);
  assert.ok(process > ledger);
});

test("commercial access keeps subscription markets separate from legacy grants", () => {
  const source = readFileSync("src/lib/market-iq/billing/access.server.ts", "utf8");
  const subscriptionBranch = source.indexOf("if (subscriptions.length > 0)");
  const legacyLookup = source.indexOf("productAccess:", subscriptionBranch);
  assert.ok(subscriptionBranch >= 0);
  assert.ok(legacyLookup > subscriptionBranch);
  assert.match(source, /source: "subscription"/);
  assert.match(source, /source: "legacy"/);
});
