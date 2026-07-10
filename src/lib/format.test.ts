import test from "node:test";
import { strict as assert } from "node:assert";
import { titleCaseSlug, roundPortfolioUnits } from "./format";

test("roundPortfolioUnits — nearest 5 below 100", () => {
  assert.equal(roundPortfolioUnits(32), 30);
  assert.equal(roundPortfolioUnits(33), 35);
  assert.equal(roundPortfolioUnits(97), 95);
});

test("roundPortfolioUnits — nearest 10 at/above 100", () => {
  assert.equal(roundPortfolioUnits(100), 100);
  assert.equal(roundPortfolioUnits(644), 640);
  assert.equal(roundPortfolioUnits(984), 980);
  assert.equal(roundPortfolioUnits(1247), 1250);
});

test("roundPortfolioUnits — the 100 boundary uses the 10-step", () => {
  assert.equal(roundPortfolioUnits(98), 100); // <100 → nearest 5 → 100
  assert.equal(roundPortfolioUnits(104), 100); // ≥100 → nearest 10 → 100
});

test("roundPortfolioUnits — passes through null/undefined/non-finite", () => {
  assert.equal(roundPortfolioUnits(null), null);
  assert.equal(roundPortfolioUnits(undefined), null);
  assert.equal(roundPortfolioUnits(NaN), null);
  assert.equal(roundPortfolioUnits(0), 0);
});

test("titleCaseSlug — single word", () => {
  assert.equal(titleCaseSlug("texas"), "Texas");
});

test("titleCaseSlug — hyphenated multi-word state slug", () => {
  assert.equal(titleCaseSlug("north-carolina"), "North Carolina");
});

test("titleCaseSlug — capitalizes every word boundary", () => {
  assert.equal(titleCaseSlug("rock-hill-nc-sc"), "Rock Hill Nc Sc");
});

test("titleCaseSlug — already-spaced input is title-cased in place", () => {
  assert.equal(titleCaseSlug("new york"), "New York");
});

test("titleCaseSlug — empty string", () => {
  assert.equal(titleCaseSlug(""), "");
});
