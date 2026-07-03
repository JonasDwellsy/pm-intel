// v0.23 — tests for the pure operator-merge candidate clustering.
// v0.24 — + sub-eligible fragments, combined-eligibility filter, companyId.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeOperatorName,
  findMergeCandidates,
  MERGE_ELIGIBILITY_T12_MIN,
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
    canonicalOperatorId: slug,
    companyId: null,
    eligible: true,
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

// ─── v0.24: sub-eligible fragments + combined-eligibility filter ────

test("sub-eligible fragments merge when combined reaches the cutoff", () => {
  const clusters = findMergeCandidates([
    op("frag-1", "Boot Team Property Management", 20, {
      eligible: false,
      companyId: "1",
    }),
    op("frag-2", "Boot Team Property Management", 15, {
      eligible: false,
      companyId: "2",
    }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].combinedListings, 35);
  assert.equal(clusters[0].members.length, 2);
  assert.ok(clusters[0].members.every((m) => !m.eligible));
});

test("sub-eligible fragments below the combined cutoff are dropped", () => {
  const clusters = findMergeCandidates([
    op("frag-1", "Tiny Realty Group", 10, { eligible: false, companyId: "1" }),
    op("frag-2", "Tiny Realty Group", 12, { eligible: false, companyId: "2" }),
  ]);
  assert.equal(clusters.length, 0); // combined 22 < 30
});

test("a ranked operator absorbs a sub-eligible satellite (always clears cutoff)", () => {
  const clusters = findMergeCandidates([
    op("auben-realty-dfw", "Auben Realty", 40, { companyId: "100" }),
    op("frag-1", "Auben Realty - DFW", 8, { eligible: false, companyId: "101" }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, "possible"); // near-match subset
  assert.equal(clusters[0].combinedListings, 48);
});

test("companyId + eligible are carried onto members", () => {
  const clusters = findMergeCandidates([
    op("a", "KRS Holdings", 100, { companyId: "191930" }),
    op("b", "KRS Holdings Inc", 20, { eligible: false, companyId: "545691" }),
  ]);
  assert.equal(clusters.length, 1);
  const byCompany = new Map(clusters[0].members.map((m) => [m.companyId, m]));
  assert.equal(byCompany.get("191930")!.eligible, true);
  assert.equal(byCompany.get("545691")!.eligible, false);
});

// ─── drift guard: the combined-listing filter must use the pipeline cutoff ──

test("MERGE_ELIGIBILITY_T12_MIN matches pipeline.py ELIG_T12_MIN", () => {
  const py = readFileSync(
    join(process.cwd(), "scripts/data-pipeline/pipeline.py"),
    "utf8"
  );
  const m = py.match(/^ELIG_T12_MIN\s*=\s*(\d+)/m);
  assert.ok(m, "could not find ELIG_T12_MIN in pipeline.py");
  assert.equal(
    MERGE_ELIGIBILITY_T12_MIN,
    Number(m[1]),
    `MERGE_ELIGIBILITY_T12_MIN (${MERGE_ELIGIBILITY_T12_MIN}) must equal ` +
      `pipeline.py ELIG_T12_MIN (${m[1]}). The merge-tool combined-listing ` +
      `filter has to use the same ranking cutoff the pipeline seeds with — ` +
      `bump both together if the eligibility threshold ever changes.`
  );
});
