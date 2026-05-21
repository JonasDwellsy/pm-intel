// v0.10 — template loader coverage. Exercises:
//   - JSON parses cleanly + every template has the required fields
//   - getTemplateBySlug returns a deep clone (mutating the clone
//     does NOT affect a subsequent fetch's value — protects the
//     module-level cache)
//   - getTemplates returns deep clones too
//   - Every shipped template's criteria reference real FIELD_REGISTRY
//     ids with valid operators (catches typos / drift)
//   - All five slugs from the v0.10 spec are present

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  getTemplates,
  getTemplateBySlug,
  summarizeTemplate,
  validateTemplate,
  type BuyBoxTemplate,
} from "./templates";

const EXPECTED_SLUGS = [
  "scale-density-rollup",
  "integrated-services-platform",
  "mid-market-acquirer",
  "distressed-operator",
  "institutional-platform",
];

test("getTemplates returns all five v0.10 templates", () => {
  const ts = getTemplates();
  assert.equal(ts.length, EXPECTED_SLUGS.length);
  for (const slug of EXPECTED_SLUGS) {
    assert.ok(
      ts.some((t) => t.slug === slug),
      `missing template "${slug}"`
    );
  }
});

test("each template carries the required fields", () => {
  for (const t of getTemplates()) {
    assert.equal(typeof t.slug, "string", `${t.slug}: slug`);
    assert.equal(typeof t.name, "string", `${t.slug}: name`);
    assert.equal(typeof t.tagline, "string", `${t.slug}: tagline`);
    assert.equal(typeof t.description, "string", `${t.slug}: description`);
    assert.ok(t.slug.length > 0);
    assert.ok(t.name.length > 0);
    assert.ok(Array.isArray(t.requiredCriteria));
    assert.ok(Array.isArray(t.preferredCriteria));
    assert.ok(Array.isArray(t.excludedCriteria));
  }
});

test("getTemplateBySlug returns null for unknown slug", () => {
  const result = getTemplateBySlug("nope-not-a-real-template");
  assert.equal(result, null);
});

test("getTemplateBySlug returns a deep clone — mutating the clone does NOT bleed back", () => {
  const first = getTemplateBySlug("scale-density-rollup") as BuyBoxTemplate;
  assert.ok(first);
  assert.ok(first.preferredCriteria.length > 0);

  // Mutate everything we hand back.
  first.name = "Mutated Name";
  first.requiredCriteria.push({
    field: "claimed",
    operator: "eq",
    value: true,
  });
  first.preferredCriteria[0].weight = 99;
  first.preferredCriteria.pop();

  // Fetch again — the cache should be untouched.
  const second = getTemplateBySlug("scale-density-rollup") as BuyBoxTemplate;
  assert.equal(second.name, "Scale-Density Rollup");
  assert.equal(second.requiredCriteria.length, 1); // unaffected
  assert.notEqual(
    second.preferredCriteria[0].weight,
    99,
    "weight should be the JSON default, not the mutated 99"
  );
});

test("getTemplates returns deep clones — mutating one element does NOT affect later fetches", () => {
  const first = getTemplates();
  const originalCount = first[0].requiredCriteria.length;
  first[0].requiredCriteria.length = 0;
  first[0].name = "WIPED";

  const second = getTemplates();
  assert.equal(second[0].requiredCriteria.length, originalCount);
  assert.notEqual(second[0].name, "WIPED");
});

test("every template's criteria reference valid FIELD_REGISTRY entries", () => {
  for (const t of getTemplates()) {
    const errors = validateTemplate(t);
    assert.deepEqual(
      errors,
      [],
      `template "${t.slug}" has invalid references: ${errors.join("; ")}`
    );
  }
});

test("summarizeTemplate produces a non-empty one-line summary for non-empty templates", () => {
  for (const t of getTemplates()) {
    const summary = summarizeTemplate(t);
    const hasAnyCriteria =
      t.requiredCriteria.length > 0 ||
      t.preferredCriteria.length > 0 ||
      t.excludedCriteria.length > 0;
    if (hasAnyCriteria) {
      assert.ok(summary.length > 0, `summary for ${t.slug} should be non-empty`);
    }
  }
});

test("scale-density-rollup matches the v0.10 spec verbatim (field ids, operators, weights)", () => {
  // Pinning the most-flagship template against the spec so a typo
  // in src/data/buy-box-templates.json gets caught before it ships.
  const t = getTemplateBySlug("scale-density-rollup") as BuyBoxTemplate;
  assert.deepEqual(t.requiredCriteria, [
    { field: "quadrant7Cell", operator: "eq", value: "SFR Independent" },
  ]);
  assert.equal(t.preferredCriteria.length, 3);
  assert.deepEqual(t.preferredCriteria[0], {
    field: "urusT12",
    operator: "between",
    value: [100, 500],
    weight: 0.3,
  });
  assert.equal(t.preferredCriteria[1].field, "concessionRate");
  assert.equal(t.preferredCriteria[1].operator, "lte");
  assert.equal(t.preferredCriteria[1].value, 0.2);
  assert.equal(t.preferredCriteria[2].field, "listingTrajectoryYoY");
  assert.equal(t.preferredCriteria[2].operator, "gte");
});

test("institutional-platform — single high-floor required criterion", () => {
  const t = getTemplateBySlug("institutional-platform") as BuyBoxTemplate;
  assert.equal(t.requiredCriteria.length, 2);
  const portfolioReq = t.requiredCriteria.find(
    (c) => c.field === "estimatedPortfolioPoint"
  );
  assert.ok(portfolioReq);
  assert.equal(portfolioReq.operator, "gte");
  assert.equal(portfolioReq.value, 1000);
});
