import assert from "node:assert/strict";
import test from "node:test";

import {
  dwellsyIqMemberHasProductAccess,
  dwellsyIqProductAccessMetadataUpdate,
  dwellsyIqProductInvitationMetadata,
} from "./product-access";

const OPERATOR_IQ = "operator-iq";

test("legacy organization memberships keep their existing access", () => {
  assert.equal(dwellsyIqMemberHasProductAccess({}, OPERATOR_IQ), true);
});

test("an Operator IQ invitation grants Operator IQ only", () => {
  const metadata = dwellsyIqProductInvitationMetadata(OPERATOR_IQ);
  assert.equal(dwellsyIqMemberHasProductAccess(metadata, OPERATOR_IQ), true);
  assert.equal(dwellsyIqMemberHasProductAccess(metadata, "another-product"), false);
});

test("an explicit Operator IQ override does not change another product default", () => {
  const metadata = dwellsyIqProductAccessMetadataUpdate({}, OPERATOR_IQ, false);
  assert.equal(dwellsyIqMemberHasProductAccess(metadata, OPERATOR_IQ), false);
  assert.equal(dwellsyIqMemberHasProductAccess(metadata, "another-product"), true);
});

test("malformed product metadata fails closed", () => {
  const invalid = { dwellsyIqProductAccess: { version: 1, default: "true", products: {} } };
  assert.equal(dwellsyIqMemberHasProductAccess(invalid, OPERATOR_IQ), false);
  assert.throws(() => dwellsyIqProductAccessMetadataUpdate(invalid, OPERATOR_IQ, true));
});
