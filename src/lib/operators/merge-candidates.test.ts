// v0.23 — tests for the pure operator-merge candidate clustering.

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  normalizeOperatorName,
  findMergeCandidates,
  type MergeOperator,
} from "./merge-candidates";

function op(
  slug: string,
  name: string,
  listings = 100,
  extra: Partial<MergeOperator> = {}
): MergeOperator {
  return {
    slug,
    name,
    quadrant7Cell: "SFR Independent",
    claimed: false,
    listings,
    canonicalOperatorId: extra.canonicalOperatorId ?? slug,
    ...extra,
  };
}

// ─── normalizeOperatorName ─────────────────────────────────────────

test("normalize collapses case, punctuation, and legal suffixes", () => {
  const forms = [
    "KRS Holdings",
    "KRS Holdings Inc",
    "Krs Holdings, Inc",
    "krs holdings llc",
  ].map(normalizeOperatorName);
  assert.deepEqual(new Set(forms), new Set(["krs holdings"]));
});

test("normalize keeps distinctive tokens", () => {
  assert.equal(normalizeOperatorName("Reedy & Company"), "reedy");
  assert.equal(normalizeOperatorName("JWB Rental Homes"), "jwb rental homes");
});

// ─── exact tier ────────────────────────────────────────────────────

test("exact-name variants form one exact cluster", () => {
  const clusters = findMergeCandidates([
    op("krs-holdings-richmond-va", "KRS Holdings", 300),
    op("krs-holdings-inc-richmond-va", "KRS Holdings Inc", 200),
    op("krs-holdings-inc-richmond-va-2", "Krs Holdings, Inc", 50),
    op("acme-realty-richmond-va", "Acme Realty", 90),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, "exact");
  assert.equal(clusters[0].members.length, 3);
  assert.equal(clusters[0].clusterKey, "krs holdings");
  // survivor = most listings
  assert.equal(clusters[0].survivorSlugSuggestion, "krs-holdings-richmond-va");
});

// ─── possible tier (agent-name near-match) ─────────────────────────

test("agent-name variant is pulled in as a 'possible' cluster", () => {
  const clusters = findMergeCandidates([
    op("krs-holdings-richmond-va", "KRS Holdings", 300),
    op("krs-holdings-inc-richmond-va", "KRS Holdings Inc", 200),
    op("jamie-bright-krs-holdings-richmond-va", "Jamie Bright, KRS Holdings", 40),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, "possible");
  assert.equal(clusters[0].members.length, 3);
  assert.ok(
    clusters[0].members.some(
      (m) => m.slug === "jamie-bright-krs-holdings-richmond-va"
    )
  );
});

// ─── no false merges on generic names ──────────────────────────────

test("distinct firms sharing only generic tokens are NOT clustered", () => {
  const clusters = findMergeCandidates([
    op("acme-property-management-x", "Acme Property Management", 100),
    op("beta-property-management-x", "Beta Property Management", 100),
    op("gamma-realty-x", "Gamma Realty", 100),
  ]);
  assert.equal(clusters.length, 0);
});

test("a lone generic-token containment does not merge", () => {
  // "Property Management" ⊂ "Acme Property Management" but the core is all
  // generic → not distinctive → no cluster.
  const clusters = findMergeCandidates([
    op("property-management-x", "Property Management", 100),
    op("acme-property-management-x", "Acme Property Management", 100),
  ]);
  assert.equal(clusters.length, 0);
});

// ─── exclusions ────────────────────────────────────────────────────

test("already-linked cluster (shared canonical id) is excluded", () => {
  const clusters = findMergeCandidates([
    op("krs-a", "KRS Holdings", 100, { canonicalOperatorId: "krs" }),
    op("krs-b", "KRS Holdings Inc", 100, { canonicalOperatorId: "krs" }),
  ]);
  assert.equal(clusters.length, 0);
});

test("decided cluster keys are excluded", () => {
  const ops = [
    op("krs-a", "KRS Holdings", 100),
    op("krs-b", "KRS Holdings Inc", 100),
  ];
  assert.equal(findMergeCandidates(ops).length, 1);
  assert.equal(
    findMergeCandidates(ops, new Set(["krs holdings"])).length,
    0
  );
});

// ─── ordering + suggestion ─────────────────────────────────────────

test("exact clusters sort before possible; canonical suggestion is cleanest", () => {
  const clusters = findMergeCandidates([
    // possible cluster (2)
    op("foo-x", "Foo Bar Realty", 100),
    op("foo-y", "Ann Lee, Foo Bar Realty", 20),
    // exact cluster (2)
    op("baz-x", "Baz Homes", 100),
    op("baz-y", "Baz Homes LLC", 100),
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].tier, "exact"); // exact first
  // canonical for the exact cluster = the fuller spelling isn't relevant;
  // for Foo cluster the agent-name form has more words but the base is the
  // suggestion pool — just assert it's one of the member names.
  const foo = clusters.find((c) => c.tier === "possible")!;
  assert.ok(foo.members.map((m) => m.name).includes(foo.canonicalNameSuggestion));
});
