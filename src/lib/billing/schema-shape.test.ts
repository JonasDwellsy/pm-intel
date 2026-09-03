import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The billing migration has NEVER been applied to production (verified
// 2026-09-01: all five tables absent, and vercel-build runs only
// `prisma generate && next build` — there is no automatic migrate deploy).
// So it is amended IN PLACE rather than superseded, and schema.prisma and the
// migration SQL must be kept in agreement by hand. This test is that
// agreement, checked at source level; CI's `prisma migrate deploy` against a
// scratch database catches anything structurally invalid.

const SCHEMA = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260826000000_consumer_single_report_billing/migration.sql"
  ),
  "utf8"
);

test("the removed SKUs' tables are gone from both schema and migration", () => {
  for (const model of ["MarketPass", "Subscription"]) {
    assert.ok(
      !new RegExp(`^model ${model} \\{`, "m").test(SCHEMA),
      `model ${model} is still in schema.prisma`
    );
    assert.ok(
      !MIGRATION.includes(`CREATE TABLE "${model}"`),
      `the migration still creates ${model}`
    );
    assert.ok(
      !MIGRATION.includes(`"${model}_`),
      `the migration still has ${model} indexes or constraints`
    );
  }
});

test("ReportCredit exists in both, keyed for idempotent minting", () => {
  assert.match(SCHEMA, /^model ReportCredit \{/m);
  assert.match(SCHEMA, /@@unique\(\[stripeSessionId, slot\]\)/);
  assert.ok(MIGRATION.includes('CREATE TABLE "ReportCredit"'));
  assert.ok(
    MIGRATION.includes('"ReportCredit_stripeSessionId_slot_key"'),
    "minting relies on this unique index to be safely repeatable"
  );
});

test("ReportEntitlement.stripeSessionId is nullable and NOT unique", () => {
  // A three-pack produces up to three entitlements from one session, so a
  // unique constraint on the session id would reject the second redemption.
  // Idempotency comes from the (pmSlug, owner) composite uniques instead.
  const model = SCHEMA.slice(
    SCHEMA.indexOf("model ReportEntitlement {"),
    SCHEMA.indexOf("}", SCHEMA.indexOf("model ReportEntitlement {"))
  );
  assert.match(model, /stripeSessionId\s+String\?/);
  assert.ok(
    !MIGRATION.includes('"ReportEntitlement_stripeSessionId_key"'),
    "the unique index on ReportEntitlement.stripeSessionId must be gone"
  );
  assert.match(model, /sourceCreditId\s+String\?\s+@unique/);
  assert.match(model, /@@unique\(\[pmSlug, organizationId\]\)/);
  assert.match(model, /@@unique\(\[pmSlug, guestEmail\]\)/);
});

test("StripeCustomer and StripeWebhookEvent survive", () => {
  // Both still serve the one-time products: customer linking and event
  // deduplication.
  assert.match(SCHEMA, /^model StripeCustomer \{/m);
  assert.match(SCHEMA, /^model StripeWebhookEvent \{/m);
});
