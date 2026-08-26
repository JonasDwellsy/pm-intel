import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePartner, DEFAULT_PARTNER } from "./partners";

test("no slug → default (Dwellsy) theme", () => {
  assert.equal(resolvePartner(null).slug, "default");
  assert.equal(resolvePartner(undefined).slug, "default");
  assert.equal(resolvePartner("").slug, "default");
});

test("unknown partner → default theme (fail-safe)", () => {
  assert.equal(resolvePartner("acme-does-not-exist"), DEFAULT_PARTNER);
});

test("known partner resolves, case/space-insensitive", () => {
  assert.equal(resolvePartner("biggerpockets").brandName, "BiggerPockets");
  assert.equal(resolvePartner("  BiggerPockets  ").slug, "biggerpockets");
});

test("default theme does not show a powered-by line; partner does", () => {
  assert.equal(resolvePartner(null).showPoweredBy, false);
  assert.equal(resolvePartner("biggerpockets").showPoweredBy, true);
});
