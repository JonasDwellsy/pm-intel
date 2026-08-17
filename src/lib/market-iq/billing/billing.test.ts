import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isActiveMarketIqSubscriptionStatus,
  MARKET_IQ_CLIENT_ADVISORY_PLAN,
  MARKET_IQ_INTELLIGENCE_PLAN,
  marketIqCapabilitiesForPlan,
  marketIqPlanPriceLabel,
} from "./plans";

test("Market IQ paid access recognizes active and grace-period states", () => {
  assert.equal(isActiveMarketIqSubscriptionStatus("active"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("trialing"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("past_due"), true);
  assert.equal(isActiveMarketIqSubscriptionStatus("canceled"), false);
  assert.equal(isActiveMarketIqSubscriptionStatus("unpaid"), false);
});

test("Market IQ exposes standard and founding prices for both tiers", () => {
  assert.equal(marketIqPlanPriceLabel(MARKET_IQ_INTELLIGENCE_PLAN.monthlyPriceCents), "$79");
  assert.equal(marketIqPlanPriceLabel(MARKET_IQ_INTELLIGENCE_PLAN.foundingMonthlyPriceCents), "$49");
  assert.equal(marketIqPlanPriceLabel(MARKET_IQ_CLIENT_ADVISORY_PLAN.monthlyPriceCents), "$199");
  assert.equal(marketIqPlanPriceLabel(MARKET_IQ_CLIENT_ADVISORY_PLAN.foundingMonthlyPriceCents), "$149");
});

test("only Client Advisory can publish and distribute reports", () => {
  assert.equal(marketIqCapabilitiesForPlan(MARKET_IQ_INTELLIGENCE_PLAN.key).publishClientReports, false);
  assert.equal(marketIqCapabilitiesForPlan(MARKET_IQ_INTELLIGENCE_PLAN.key).sendReports, false);
  assert.equal(marketIqCapabilitiesForPlan(MARKET_IQ_CLIENT_ADVISORY_PLAN.key).publishClientReports, true);
  assert.equal(marketIqCapabilitiesForPlan("single_market_monthly").sendReports, true);
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

test("Client Advisory capabilities are enforced by pages, mutations, and the scheduler", () => {
  const reportAction = readFileSync("src/app/market-iq/report/actions.ts", "utf8");
  const distributionAction = readFileSync("src/app/market-iq/distribution/actions.ts", "utf8");
  const editionsAction = readFileSync("src/app/market-iq/editions/actions.ts", "utf8");
  const orchestrator = readFileSync("src/lib/market-iq/report/edition-orchestrator.server.ts", "utf8");
  assert.match(reportAction, /capabilities\.publishClientReports/);
  assert.match(distributionAction, /capabilities\.manageRecipients/);
  assert.match(distributionAction, /capabilities\.sendReports/);
  assert.match(editionsAction, /capabilities\.useRecurringEditions/);
  assert.match(orchestrator, /MARKET_IQ_CLIENT_ADVISORY_PLAN\.key/);
  assert.match(orchestrator, /MARKET_IQ_LEGACY_SINGLE_MARKET_PLAN_KEY/);
});

test("checkout accepts only a selected, configured plan", () => {
  const source = readFileSync("src/app/api/market-iq/billing/checkout/route.ts", "utf8");
  assert.match(source, /formData\.get\("planKey"\)/);
  assert.match(source, /marketIqPlanForKey\(requestedPlanKey\)/);
  assert.match(source, /STRIPE_MARKET_IQ_INTELLIGENCE_FOUNDING_PRICE_ID/);
  assert.match(source, /STRIPE_MARKET_IQ_CLIENT_ADVISORY_FOUNDING_PRICE_ID/);
});
