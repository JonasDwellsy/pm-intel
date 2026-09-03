import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerWhere, type CreditOwner } from "./credits";

// Ownership is guest-OR-org, never both and never neither. Getting this wrong
// is how you build a query that matches on a NULL column and hands one
// buyer's credits to another.

test("an org owner keys on organizationId alone", () => {
  const o: CreditOwner = { organizationId: "org_1", guestEmail: null };
  assert.deepEqual(ownerWhere(o), { organizationId: "org_1" });
});

test("a guest owner keys on guestEmail alone", () => {
  const o: CreditOwner = { organizationId: null, guestEmail: "a@b.com" };
  assert.deepEqual(ownerWhere(o), { guestEmail: "a@b.com" });
});

test("the org wins when both are somehow present", () => {
  // The checkout route sets guestEmail to null whenever an org is known, so
  // this should not occur — but a query that filtered on both would match
  // nothing at all, which fails silently. Prefer the org, deterministically.
  const o: CreditOwner = { organizationId: "org_1", guestEmail: "a@b.com" };
  assert.deepEqual(ownerWhere(o), { organizationId: "org_1" });
});

test("an ownerless credit query throws rather than matching everything", () => {
  assert.throws(
    () => ownerWhere({ organizationId: null, guestEmail: null }),
    /owner/i
  );
});
