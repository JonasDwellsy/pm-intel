import test from "node:test";
import { strict as assert } from "node:assert";
import { sortRankedOperators } from "./rank-sort";

const rows = [
  { name: "Muddy Waters Realty", totalObservedUnits: 142 },
  { name: "allstar management", totalObservedUnits: 225 },
  { name: "River City Land Company", displayName: "River City LLC", totalObservedUnits: 145 },
];

test("rank preserves the incoming (server star-ranking) order and returns the same array", () => {
  const out = sortRankedOperators(rows, "rank");
  assert.equal(out, rows); // identity — no copy
  assert.deepEqual(out.map((r) => r.name), rows.map((r) => r.name));
});

test("size sorts by observed units descending (largest first)", () => {
  const out = sortRankedOperators(rows, "size");
  assert.deepEqual(out.map((r) => r.totalObservedUnits), [225, 145, 142]);
  assert.notEqual(out, rows); // does not mutate the input array
});

test("name sorts alphabetically, case-insensitively, using displayName when present", () => {
  const out = sortRankedOperators(rows, "name");
  // "allstar" (case-insensitive) < "Muddy" < "River City LLC" (displayName)
  assert.deepEqual(out.map((r) => r.displayName ?? r.name), [
    "allstar management",
    "Muddy Waters Realty",
    "River City LLC",
  ]);
});
