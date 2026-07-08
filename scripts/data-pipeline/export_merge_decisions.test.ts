import { test } from "node:test";
import assert from "node:assert/strict";
import { nameKey, resolveDecisions, keyForPm, keyForFragment } from "./export_merge_decisions";

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

test("keyForPm keys a parented operator by parent id, a no-parent one by name", () => {
  assert.equal(keyForPm({ slug: "a", name: "31 Realty Property Management", marketId: "dfw", parentCompanyId: 31871 }), "31871");
  assert.equal(keyForPm({ slug: "b", name: "31 Realty Property Management LLC", marketId: "dfw", parentCompanyId: null }), "name:31realtypropertymanagementllc");
  assert.equal(keyForPm({ slug: "c", name: "No Parent Co", marketId: "dfw" }), "name:noparentco");
});

test("resolveDecisions folds a no-parent fragment into a parent-keyed survivor", () => {
  // The real 31 Realty (DFW) shape: survivor is a parent company (id 31871),
  // the "LLC" fragment is unparented. The exported keys must match what the
  // pipeline's within_market_key will see — parent id for the survivor.
  const seed = [
    { slug: "31-realty", name: "31 Realty Property Management", marketId: "dfw", parentCompanyId: 31871 },
    { slug: "31-realty-llc", name: "31 Realty Property Management LLC", marketId: "dfw", parentCompanyId: null },
  ];
  const decisions = [{ marketId: "dfw", decision: "merge", canonicalName: "31 Realty Property Management",
    survivorSlug: "31-realty", memberSlugs: JSON.stringify(["31-realty", "31-realty-llc"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(skipped.length, 0);
  assert.equal(out[0].survivorKey, "31871");
  assert.deepEqual(out[0].memberKeys.sort(), ["31871", "name:31realtypropertymanagementllc"]);
});

test("resolveDecisions SKIPS a decision with an unresolvable member slug", () => {
  const seed = [{ slug: "krs-holdings", name: "KRS Holdings", marketId: "phoenix-az" }];
  const decisions = [{ marketId: "phoenix-az", decision: "merge", canonicalName: "KRS Holdings",
    survivorSlug: "krs-holdings", memberSlugs: JSON.stringify(["krs-holdings", "gone-slug"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed);
  assert.equal(out.length, 0);
  assert.equal(skipped.length, 1);
});

test("keyForFragment strips the frag- prefix to recover the grouping key", () => {
  assert.equal(keyForFragment({ slug: "frag-name:statewidemanagement" }), "name:statewidemanagement");
  assert.equal(keyForFragment({ slug: "frag-31871" }), "31871");
});

test("resolveDecisions folds a sub-eligible fragment member (frag- slug)", () => {
  const seed = [{ slug: "big-op", name: "Big Op Property Management", marketId: "la", parentCompanyId: 700 }];
  const fragments = [{ marketId: "la", slug: "frag-name:bigoppropertymanagementllc", name: "Big Op Property Management LLC" }];
  const decisions = [{ marketId: "la", decision: "merge", canonicalName: "Big Op Property Management",
    survivorSlug: "big-op",
    memberSlugs: JSON.stringify(["big-op", "frag-name:bigoppropertymanagementllc"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed, fragments as any);
  assert.equal(skipped.length, 0);
  assert.equal(out[0].survivorKey, "700");
  assert.deepEqual(out[0].memberKeys.sort(), ["700", "name:bigoppropertymanagementllc"]);
});

test("resolveDecisions still SKIPS a slug in neither pms nor the sidecar", () => {
  const seed = [{ slug: "big-op", name: "Big Op", marketId: "la" }];
  const decisions = [{ marketId: "la", decision: "merge", canonicalName: "Big Op",
    survivorSlug: "big-op", memberSlugs: JSON.stringify(["big-op", "frag-name:ghost"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed, []);
  assert.equal(out.length, 0);
  assert.equal(skipped.length, 1);
});
