import test from "node:test";
import { strict as assert } from "node:assert";
import { canViewList, canEditList } from "./visibility";
import { LEGACY_OWNER_ID } from "./store";

const ORG = "org_1";
const ME = "user_me";
const ctx = { userId: ME, organizationId: ORG };
const base = { organizationId: ORG, isShared: false };

test("owner can view + edit their private list", () => {
  const l = { ...base, ownerId: ME };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), true);
});
test("non-owner in org can VIEW a shared list but not edit it", () => {
  const l = { ownerId: "user_other", organizationId: ORG, isShared: true };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), false);
});
test("non-owner cannot view another's PRIVATE list", () => {
  const l = { ownerId: "user_other", organizationId: ORG, isShared: false };
  assert.equal(canViewList(l, ctx), false);
});
test("legacy-owner shared list is org-editable (grandfathered)", () => {
  const l = { ownerId: LEGACY_OWNER_ID, organizationId: ORG, isShared: true };
  assert.equal(canViewList(l, ctx), true);
  assert.equal(canEditList(l, ctx), true);
});
test("cross-org: cannot view a shared list in a different org", () => {
  const l = { ownerId: "user_other", organizationId: "org_2", isShared: true };
  assert.equal(canViewList(l, ctx), false);
  assert.equal(canEditList(l, ctx), false);
});
test("null organizationId (legacy sentinel row) is invisible", () => {
  const l = { ownerId: LEGACY_OWNER_ID, organizationId: null, isShared: true };
  assert.equal(canViewList(l, ctx), false);
});
