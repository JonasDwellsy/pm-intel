import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTS,
  creditsFor,
  resolvePriceId,
  productForPriceId,
  type ProductKind,
} from "./products";

// Two one-time SKUs, $149 and $299. The market pass and the $19/mo
// subscription are gone: monitoring is the enterprise product's core claim,
// and the subscription's access path granted every market (it carried no
// marketId and the resolver never filtered by one).

test("exactly two SKUs, both one-time payments", () => {
  assert.deepEqual(Object.keys(PRODUCTS).sort(), ["single_report", "three_pack"]);
  for (const p of Object.values(PRODUCTS)) {
    assert.equal(p.stripeMode, "payment", `${p.kind} must not be recurring`);
  }
});

test("prices are 149 and 299", () => {
  assert.equal(PRODUCTS.single_report.priceUsd, 149);
  assert.equal(PRODUCTS.three_pack.priceUsd, 299);
});

test("credits per SKU", () => {
  assert.equal(creditsFor("single_report"), 1);
  assert.equal(creditsFor("three_pack"), 3);
});

test("the pack is cheaper per report than three singles", () => {
  const single = PRODUCTS.single_report;
  const pack = PRODUCTS.three_pack;
  assert.ok(
    pack.priceUsd < single.priceUsd * pack.credits,
    "the pack must save money or it is not a pack"
  );
});

test("resolvePriceId reads the SKU's env var and throws loudly when unset", () => {
  const prev = process.env.STRIPE_PRICE_REPORT;
  process.env.STRIPE_PRICE_REPORT = "price_test_single";
  assert.equal(resolvePriceId("single_report"), "price_test_single");
  delete process.env.STRIPE_PRICE_REPORT;
  assert.throws(() => resolvePriceId("single_report"), /STRIPE_PRICE_REPORT/);
  if (prev !== undefined) process.env.STRIPE_PRICE_REPORT = prev;
});

test("productForPriceId maps a live price back to its SKU", () => {
  const prevA = process.env.STRIPE_PRICE_REPORT;
  const prevB = process.env.STRIPE_PRICE_THREE_PACK;
  process.env.STRIPE_PRICE_REPORT = "price_a";
  process.env.STRIPE_PRICE_THREE_PACK = "price_b";
  assert.equal(productForPriceId("price_a"), "single_report");
  assert.equal(productForPriceId("price_b"), "three_pack");
  assert.equal(productForPriceId("price_unknown"), null);
  if (prevA === undefined) delete process.env.STRIPE_PRICE_REPORT;
  else process.env.STRIPE_PRICE_REPORT = prevA;
  if (prevB === undefined) delete process.env.STRIPE_PRICE_THREE_PACK;
  else process.env.STRIPE_PRICE_THREE_PACK = prevB;
});

test("no SKU mentions a market or a subscription", () => {
  const kinds = Object.keys(PRODUCTS) as ProductKind[];
  for (const k of kinds) {
    assert.ok(!/market|subscription/i.test(k), `${k} looks like a removed SKU`);
  }
});
