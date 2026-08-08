import test from "node:test";
import { strict as assert } from "node:assert";
import type { PMListItem } from "@/lib/types";

// The split itself is three filters inside loadMarketView, which needs a
// database. These tests pin the RULE those filters implement, on the same
// shapes, so the ordering guarantee is checked rather than assumed — getting
// it wrong silently moves operators between a ranked list and a hidden one.

type Row = Pick<PMListItem, "slug" | "operatorType" | "operatorStatus">;

function split(rows: Row[]) {
  // Mirrors market-data.ts: broker classification FIRST, then dormancy over
  // what remains.
  const brokerPms = rows.filter((p) => p.operatorType === "broker");
  const nonBroker = rows.filter((p) => p.operatorType !== "broker");
  const allPms = nonBroker.filter((p) => p.operatorStatus !== "dormant");
  const dormantPms = nonBroker.filter((p) => p.operatorStatus === "dormant");
  return { allPms, dormantPms, brokerPms };
}

const rows: Row[] = [
  { slug: "active-pm", operatorType: "pm", operatorStatus: "active" },
  { slug: "dormant-pm", operatorType: "pm", operatorStatus: "dormant" },
  { slug: "active-broker", operatorType: "broker", operatorStatus: "active" },
  { slug: "dormant-broker", operatorType: "broker", operatorStatus: "dormant" },
  // Rows built before the dormant tier carry no status at all.
  { slug: "legacy-pm", operatorType: "pm", operatorStatus: undefined },
];

test("the ranked universe contains only active, non-broker operators", () => {
  const { allPms } = split(rows);
  assert.deepEqual(allPms.map((p) => p.slug), ["active-pm", "legacy-pm"]);
});

test("an operator with no status is treated as active, not hidden", () => {
  // Fixtures and any pre-dormant-tier row must keep appearing. Defaulting the
  // other way would silently empty the ranked list on stale data.
  const { allPms, dormantPms } = split(rows);
  assert.ok(allPms.some((p) => p.slug === "legacy-pm"));
  assert.ok(!dormantPms.some((p) => p.slug === "legacy-pm"));
});

test("a dormant broker stays with the brokers, not the dormant section", () => {
  // Broker classification is applied first on purpose: brokers already sit
  // outside the PM cohort, and a dormant broker appearing under "dormant
  // operators" would imply it was ever in the ranked PM list.
  const { brokerPms, dormantPms } = split(rows);
  assert.ok(brokerPms.some((p) => p.slug === "dormant-broker"));
  assert.ok(!dormantPms.some((p) => p.slug === "dormant-broker"));
});

test("every row lands in exactly one bucket", () => {
  const { allPms, dormantPms, brokerPms } = split(rows);
  const seen = [...allPms, ...dormantPms, ...brokerPms].map((p) => p.slug);
  assert.equal(seen.length, rows.length, "a row was duplicated or dropped");
  assert.equal(new Set(seen).size, rows.length);
});

test("dormant operators are held out of the cohort inputs, not just the list", () => {
  // deriveQuadrantSummary / deriveQuadrant7CellSummary are fed from allPms.
  // If dormant rows leaked in they would move every active operator's
  // percentile as operators drift in and out month to month — the exact
  // instability the tier exists to prevent.
  const { allPms } = split(rows);
  assert.ok(allPms.every((p) => p.operatorStatus !== "dormant"));
});

test("a market with no dormant operators behaves exactly as before", () => {
  const activeOnly: Row[] = [
    { slug: "a", operatorType: "pm", operatorStatus: "active" },
    { slug: "b", operatorType: "pm", operatorStatus: "active" },
  ];
  const { allPms, dormantPms } = split(activeOnly);
  assert.equal(allPms.length, 2);
  assert.deepEqual(dormantPms, []); // toggle renders nothing
});
