import test from "node:test";
import { strict as assert } from "node:assert";
import { diffSnapshots, type OperatorChange } from "./change-detection";
import { applySimultaneityGuardrail } from "./dormancy-guardrail";
import { buildListChanges, type OperatorMeta } from "./digest-gather";
import { describeChange } from "./digest";
import type { SnapshotRow, StarsPerMetric } from "./snapshot";

// Phase 3 — the dormancy change alert and its simultaneity guardrail.
//
// Two cases drive everything here, both from real data:
//   Riparian  — quiet in Pittsburgh, still listing in Baltimore. MUST fire.
//   Bridge    — quiet in 13 markets inside 7 days. MUST collapse to one note.
// If the second one ever fires as 13 alerts, a client is told their operator
// collapsed nationwide when nothing happened at all.

const NO_STARS: StarsPerMetric = {
  leaseUp: null,
  tenancy: null,
  rentPerformance: null,
  marketingDiscipline: null,
  inventoryTransparency: null,
};

function snap(over: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    pmSlug: "op-pittsburgh-pa",
    snapshotDate: new Date("2026-08-06"),
    methodologyVersion: "v0.8",
    starsPerMetric: NO_STARS,
    starGoldCount: 0,
    starSilverCount: 0,
    estimatedPortfolioPoint: 300,
    estimatedPortfolioBand: "200–400",
    topMSAs: [],
    topSubmarkets: [],
    concessionRate: null,
    isEligibleForRanking: true,
    quadrant7Cell: null,
    operatorStatus: "active",
    lastListingDate: "2026-07-30",
    ...over,
  };
}

const dormancyOf = (cs: OperatorChange[]) =>
  cs.find((c) => c.type === "dormancy");

test("an operator going quiet produces a dormancy change", () => {
  const changes = diffSnapshots(
    snap(),
    snap({ operatorStatus: "dormant", lastListingDate: "2026-05-27" })
  );
  const d = dormancyOf(changes);
  assert.ok(d && d.type === "dormancy");
  assert.equal(d.direction, "entered");
  assert.equal(d.lastListingDate, "2026-05-27");
  // 2026-05-27 → 2026-08-06 is 71 days. Derived from the snapshot pair, so it
  // is the same number whenever this digest is regenerated.
  assert.equal(d.daysQuiet, 71);
});

test("listings reappearing produces a resumed change with no day count", () => {
  const changes = diffSnapshots(
    snap({ operatorStatus: "dormant", lastListingDate: "2026-05-27" }),
    snap({ operatorStatus: "active", lastListingDate: "2026-08-01" })
  );
  const d = dormancyOf(changes);
  assert.ok(d && d.type === "dormancy");
  assert.equal(d.direction, "resumed");
  assert.equal(d.daysQuiet, null); // nothing is quiet — the count would be noise
});

test("an unknown prior status produces no dormancy alert", () => {
  // Every snapshot written before this phase carries null. Treating null as
  // "active" would fire a dormancy alert for every already-dormant operator
  // on the first digest after deploy — a one-off wave of false alarms.
  const changes = diffSnapshots(
    snap({ operatorStatus: null, lastListingDate: null }),
    snap({ operatorStatus: "dormant", lastListingDate: "2026-05-27" })
  );
  assert.equal(dormancyOf(changes), undefined);
});

test("a methodology change never flips dormancy into an alert", () => {
  // The recency gate that defines dormancy is a methodology parameter. Moving
  // it would reclassify a whole cohort at once with no operator having done
  // anything, so the whole diff is suppressed on a version change.
  const changes = diffSnapshots(
    snap({ methodologyVersion: "v0.7" }),
    snap({
      methodologyVersion: "v0.8",
      operatorStatus: "dormant",
      lastListingDate: "2026-05-27",
    })
  );
  assert.equal(dormancyOf(changes), undefined);
});

test("no status change produces no dormancy alert", () => {
  assert.equal(dormancyOf(diffSnapshots(snap(), snap())), undefined);
  const stillDormant = { operatorStatus: "dormant" as const, lastListingDate: "2026-05-27" };
  assert.equal(
    dormancyOf(diffSnapshots(snap(stillDormant), snap(stillDormant))),
    undefined
  );
});

// ---------------------------------------------------------------- guardrail

test("Riparian: one market quiet while others still list — the alert stands", () => {
  const { suppressedPmSlugs, coverageNotes } = applySimultaneityGuardrail([
    { operatorKey: "riparian", pmSlug: "riparian-pittsburgh-pa", lastListingDate: "2026-05-27" },
  ]);
  assert.equal(suppressedPmSlugs.size, 0);
  assert.equal(coverageNotes.size, 0);
});

test("Bridge: 13 markets quiet within a week collapses to one coverage note", () => {
  const events = Array.from({ length: 13 }, (_, i) => ({
    operatorKey: "bridge",
    pmSlug: `bridge-market-${i}`,
    // Spread across 7 days, the real shape of a feed migration.
    lastListingDate: `2026-06-${String(10 + (i % 7)).padStart(2, "0")}`,
  }));
  const { suppressedPmSlugs, coverageNotes } = applySimultaneityGuardrail(events);
  assert.equal(suppressedPmSlugs.size, 13);
  const note = coverageNotes.get("bridge");
  assert.ok(note);
  assert.equal(note.marketsQuiet, 13);
  assert.equal(note.windowDays, 6);
  assert.equal(note.lastListingDate, "2026-06-16"); // latest across the group
});

test("two markets going quiet months apart are two independent alerts", () => {
  // Real operator behaviour: exited Cleveland in March, Columbus in July.
  // Collapsing these would hide two genuine signals behind one shrug.
  const { suppressedPmSlugs, coverageNotes } = applySimultaneityGuardrail([
    { operatorKey: "op", pmSlug: "op-cleveland-oh", lastListingDate: "2026-03-01" },
    { operatorKey: "op", pmSlug: "op-columbus-oh", lastListingDate: "2026-07-01" },
  ]);
  assert.equal(suppressedPmSlugs.size, 0);
  assert.equal(coverageNotes.size, 0);
});

test("the window boundary is inclusive at 14 days and excludes 15", () => {
  const pair = (second: string) =>
    applySimultaneityGuardrail([
      { operatorKey: "op", pmSlug: "a", lastListingDate: "2026-06-01" },
      { operatorKey: "op", pmSlug: "b", lastListingDate: second },
    ]);
  assert.equal(pair("2026-06-15").suppressedPmSlugs.size, 2); // 14 days — collapse
  assert.equal(pair("2026-06-16").suppressedPmSlugs.size, 0); // 15 days — stands
});

test("a missing date leaves the per-market alerts standing", () => {
  // We cannot show the events were simultaneous, so we do not silently drop
  // them. Over-reporting a real quiet market beats swallowing it.
  const { suppressedPmSlugs } = applySimultaneityGuardrail([
    { operatorKey: "op", pmSlug: "a", lastListingDate: "2026-06-01" },
    { operatorKey: "op", pmSlug: "b", lastListingDate: null },
  ]);
  assert.equal(suppressedPmSlugs.size, 0);
});

test("different operators going quiet in the same week are never merged", () => {
  const { suppressedPmSlugs, coverageNotes } = applySimultaneityGuardrail([
    { operatorKey: "alpha", pmSlug: "alpha-a", lastListingDate: "2026-06-01" },
    { operatorKey: "beta", pmSlug: "beta-b", lastListingDate: "2026-06-03" },
  ]);
  assert.equal(suppressedPmSlugs.size, 0);
  assert.equal(coverageNotes.size, 0);
});

// ------------------------------------------------------- end-to-end gather

function meta(operatorKey: string, market: string): OperatorMeta {
  return {
    name: "Test Operator",
    marketLabel: market,
    scorecardUrl: "https://example.test/x",
    operatorKey,
  };
}

function gather(
  slugs: string[],
  build: (slug: string) => { prior: SnapshotRow; latest: SnapshotRow; meta: OperatorMeta }
) {
  const priorBySlug = new Map<string, SnapshotRow>();
  const latestBySlug = new Map<string, SnapshotRow>();
  const metaBySlug = new Map<string, OperatorMeta>();
  for (const s of slugs) {
    const b = build(s);
    priorBySlug.set(s, b.prior);
    latestBySlug.set(s, b.latest);
    metaBySlug.set(s, b.meta);
  }
  return buildListChanges({
    watchListName: "L",
    matchedPmSlugs: slugs,
    latestBySlug,
    priorBySlug,
    metaBySlug,
  });
}

test("Riparian end to end: the quiet market reports, the active one is silent", () => {
  const out = gather(["riparian-pittsburgh-pa", "riparian-baltimore-md"], (slug) => {
    const quiet = slug.includes("pittsburgh");
    return {
      prior: snap({ pmSlug: slug }),
      latest: snap({
        pmSlug: slug,
        ...(quiet
          ? { operatorStatus: "dormant" as const, lastListingDate: "2026-05-27" }
          : {}),
      }),
      meta: meta("riparian", quiet ? "Pittsburgh" : "Baltimore"),
    };
  });
  assert.equal(out.operators.length, 1);
  assert.equal(out.operators[0].marketLabel, "Pittsburgh");
  assert.ok(out.operators[0].changes.some((c) => c.type === "dormancy"));
});

test("Bridge end to end: 13 quiet markets become one operator row with one note", () => {
  const slugs = Array.from({ length: 13 }, (_, i) => `bridge-m${i}`);
  const out = gather(slugs, (slug) => ({
    prior: snap({ pmSlug: slug }),
    latest: snap({
      pmSlug: slug,
      operatorStatus: "dormant",
      lastListingDate: "2026-06-12",
    }),
    meta: meta("bridge", slug),
  }));

  // Twelve rows had nothing left to say and dropped out entirely.
  assert.equal(out.operators.length, 1);
  const changes = out.operators[0].changes;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "coverage_note");
  // Not a single per-market dormancy alert survived.
  assert.equal(
    out.operators.flatMap((o) => o.changes).filter((c) => c.type === "dormancy").length,
    0
  );
});

test("a suppressed operator keeps its unrelated changes", () => {
  // Collapsing the dormancy alerts must not swallow a real star move that
  // happened in the same period.
  const slugs = ["b-m0", "b-m1"];
  const out = gather(slugs, (slug) => ({
    prior: snap({ pmSlug: slug }),
    latest: snap({
      pmSlug: slug,
      operatorStatus: "dormant",
      lastListingDate: "2026-06-12",
      starsPerMetric: { ...NO_STARS, leaseUp: "gold" },
      starGoldCount: 1,
    }),
    meta: meta("b", slug),
  }));
  assert.equal(out.operators.length, 2);
  for (const o of out.operators) {
    assert.ok(o.changes.some((c) => c.type === "star"));
    assert.ok(!o.changes.some((c) => c.type === "dormancy"));
  }
  // Exactly one coverage note across the pair, on a stable row.
  const notes = out.operators.flatMap((o) => o.changes).filter((c) => c.type === "coverage_note");
  assert.equal(notes.length, 1);
});

// -------------------------------------------------------------------- copy

test("the alert copy states the observed fact and claims nothing more", () => {
  const line = describeChange({
    type: "dormancy",
    direction: "entered",
    lastListingDate: "2026-05-27",
    daysQuiet: 71,
  });
  assert.equal(line, "No new listings observed since May 27, 2026 (71 days)");

  const note = describeChange({
    type: "coverage_note",
    marketsQuiet: 13,
    windowDays: 6,
    lastListingDate: "2026-06-16",
  });
  assert.match(note, /13 watched markets at once/);
  assert.match(note, /rather than a change in their business/);

  // The words we never use — each asserts a business fact we did not observe
  // and cannot support, in a line a client may forward to the operator.
  for (const text of [line, note, describeChange({ type: "dormancy", direction: "resumed", lastListingDate: null, daysQuiet: null })]) {
    for (const forbidden of [
      /\binactive\b/i, /\bdeparted\b/i, /left the market/i,
      /out of business/i, /\bclosed\b/i, /shut down/i, /\bceased\b/i,
    ]) {
      assert.ok(!forbidden.test(text), `"${text}" must not say ${forbidden}`);
    }
  }
});
