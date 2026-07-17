import test from "node:test";
import { strict as assert } from "node:assert";
import { addAlias, dbaAlias } from "./search-index-aliases";

test("dbaAlias returns the DBA when it differs from the name", () => {
  assert.equal(dbaAlias("Haven Residential", "29th Street Property Management"), "29th Street Property Management");
});
test("dbaAlias returns null when equal, casing-only, or empty", () => {
  assert.equal(dbaAlias("Acme", "acme"), null);
  assert.equal(dbaAlias("Acme", "Acme"), null);
  assert.equal(dbaAlias("Acme", null), null);
  assert.equal(dbaAlias("Acme", "  "), null);
});
test("addAlias adds a genuine alias, trims, and skips empties/same-as-primary/dupes", () => {
  const a: string[] = [];
  addAlias(a, "  Old Name  ", "New Name");
  addAlias(a, "new name", "New Name"); // same as primary (casing) → skip
  addAlias(a, "", "New Name"); // empty → skip
  addAlias(a, null, "New Name"); // null → skip
  addAlias(a, "OLD NAME", "New Name"); // dupe (casing) → skip
  assert.deepEqual(a, ["Old Name"]);
});
