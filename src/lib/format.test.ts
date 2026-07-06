import test from "node:test";
import { strict as assert } from "node:assert";
import { titleCaseSlug } from "./format";

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
