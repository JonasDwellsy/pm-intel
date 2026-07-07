import { test } from "node:test";
import assert from "node:assert/strict";
import { nameKey, resolveDecisions } from "./export_merge_decisions";

test("nameKey matches Python name_key (lowercase alphanumerics only)", () => {
  assert.equal(nameKey("Jamie Bright, KRS Holdings"), "jamiebrightkrsholdings");
  assert.equal(nameKey("R.P. Management, Inc."), "rpmanagementinc");
});

test("resolveDecisions maps member slugs to name-keys", () => {
  const seed = [
    { slug: "krs-holdings", name: "KRS Holdings", marketId: "phoenix-az" },
    { slug: "jamie-bright-krs-holdings", name: "Jamie Bright, KRS Holdings", marketId: "phoenix-az" },
  ];
  const decisions = [{ marketId: "phoenix-az", decision: "merge", canonicalName: "KRS Holdings",
    survivorSlug: "krs-holdings", memberSlugs: JSON.stringify(["krs-holdings", "jamie-bright-krs-holdings"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(skipped.length, 0);
  assert.deepEqual(out[0].memberKeys.sort(), ["name:jamiebrightkrsholdings", "name:krsholdings"]);
  assert.equal(out[0].survivorKey, "name:krsholdings");
});

test("resolveDecisions SKIPS a decision with an unresolvable member slug", () => {
  const seed = [{ slug: "krs-holdings", name: "KRS Holdings", marketId: "phoenix-az" }];
  const decisions = [{ marketId: "phoenix-az", decision: "merge", canonicalName: "KRS Holdings",
    survivorSlug: "krs-holdings", memberSlugs: JSON.stringify(["krs-holdings", "gone-slug"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(out.length, 0);
  assert.equal(skipped.length, 1);
});
