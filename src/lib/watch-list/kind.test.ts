import test from "node:test";
import { strict as assert } from "node:assert";
import { hasCriteria, shouldSkipCriteriaMatch, deriveListKind } from "./kind";

const empty = { requiredCriteria: [], preferredCriteria: [], excludedCriteria: [] };
const withReq = { requiredCriteria: [{}], preferredCriteria: [], excludedCriteria: [] };
const withPref = { requiredCriteria: [], preferredCriteria: [{}], excludedCriteria: [] };
const withExcl = { requiredCriteria: [], preferredCriteria: [], excludedCriteria: [{}] };

test("hasCriteria: empty is false; any non-empty axis is true", () => {
  assert.equal(hasCriteria(empty), false);
  assert.equal(hasCriteria(withReq), true);
  assert.equal(hasCriteria(withPref), true);
  assert.equal(hasCriteria(withExcl), true);
});

test("shouldSkipCriteriaMatch is the inverse of hasCriteria", () => {
  assert.equal(shouldSkipCriteriaMatch(empty), true);
  assert.equal(shouldSkipCriteriaMatch(withReq), false);
});

test("deriveListKind covers all four quadrants", () => {
  assert.equal(deriveListKind(withReq, 3), "hybrid"); // criteria + pins
  assert.equal(deriveListKind(withReq, 0), "smart"); // criteria only
  assert.equal(deriveListKind(empty, 3), "pinned"); // pins only
  assert.equal(deriveListKind(empty, 0), "pinned"); // neither → pinned (matches today's default)
});
