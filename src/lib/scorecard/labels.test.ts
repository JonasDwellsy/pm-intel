import test from "node:test";
import { strict as assert } from "node:assert";
import { scoreLabel } from "./labels";

test("scoreLabel maps percentile bands (>=75/50/25) with boundaries", () => {
  assert.equal(scoreLabel(90), "strong");
  assert.equal(scoreLabel(75), "strong");   // boundary is inclusive
  assert.equal(scoreLabel(74.9), "good");
  assert.equal(scoreLabel(50), "good");
  assert.equal(scoreLabel(49.9), "neutral");
  assert.equal(scoreLabel(25), "neutral");
  assert.equal(scoreLabel(24.9), "watch");
  assert.equal(scoreLabel(0), "watch");
});

test("scoreLabel treats null/undefined as insufficient", () => {
  assert.equal(scoreLabel(null), "insufficient");
  assert.equal(scoreLabel(undefined), "insufficient");
});
