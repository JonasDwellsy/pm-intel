import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasProductAccess } from "./product-entitlements";

test("product entitlement grants only explicit modules", () => {
  const input = { isAdmin: false, grantedProductKeys: ["operator_iq"] };
  assert.equal(hasProductAccess(input, "operator_iq"), true);
  assert.equal(hasProductAccess(input, "market_iq"), false);
});

test("product entitlement fails closed with no grants", () => {
  assert.equal(
    hasProductAccess({ isAdmin: false, grantedProductKeys: [] }, "market_iq"),
    false
  );
});

test("Dwellsy admins can preview every product", () => {
  assert.equal(
    hasProductAccess({ isAdmin: true, grantedProductKeys: [] }, "market_iq"),
    true
  );
});

test("product migration is additive and preserves Operator IQ access", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260808150000_product_entitlements/migration.sql"
    ),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "OrganizationProductAccess"/);
  assert.match(sql, /'operator_iq'/);
  assert.doesNotMatch(sql, /ALTER TABLE "Organization"/);
  assert.doesNotMatch(sql, /UPDATE "Organization"/);
  assert.doesNotMatch(sql, /DELETE FROM/);
});
