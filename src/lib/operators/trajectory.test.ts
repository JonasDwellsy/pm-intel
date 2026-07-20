// v0.22 (3a) — input/output tests for the pure trajectory shaping. The
// loadOperatorTrajectory loader (prisma) is exercised at runtime; these
// cover the shaping the UI depends on.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  summarizeTrajectory,
  buildSparkline,
  aggregateMemberSnapshots,
  quarterEndDate,
  collapseMemberRowsToQuarterly,
  keepCurrentGenerationSnapshots,
  clampFutureTrajectoryDates,
  parseSubmarketCount,
  attachShareOfMarket,
  type OperatorTrajectory,
  type TrajectoryPoint,
  type MemberSnapshotRow,
} from "./trajectory";

function pt(date: string, portfolioPoint: number | null, gold = 0, silver = 0): TrajectoryPoint {
  return { date, portfolioPoint, portfolioBand: null, goldCount: gold, silverCount: silver, eligible: true };
}
function traj(points: TrajectoryPoint[]): OperatorTrajectory {
  return { pmSlug: "x", points };
}

// ─── summarizeTrajectory ─────────────────────────────────────────

test("summarize — empty series", () => {
  const s = summarizeTrajectory(traj([]));
  assert.equal(s.pointCount, 0);
  assert.equal(s.firstDate, null);
  assert.equal(s.hasTrend, false);
  assert.equal(s.netPortfolioDelta, null);
});

test("summarize — single point has no trend, no delta", () => {
  const s = summarizeTrajectory(traj([pt("2026-06-28", 500)]));
  assert.equal(s.pointCount, 1);
  assert.equal(s.firstDate, "2026-06-28");
  assert.equal(s.lastDate, "2026-06-28");
  assert.equal(s.hasTrend, false);
  assert.equal(s.netPortfolioDelta, null);
});

test("summarize — growth across points", () => {
  const s = summarizeTrajectory(traj([pt("2026-05-19", 420), pt("2026-06-02", 500), pt("2026-06-28", 600)]));
  assert.equal(s.hasTrend, true);
  assert.equal(s.firstPortfolio, 420);
  assert.equal(s.lastPortfolio, 600);
  assert.equal(s.netPortfolioDelta, 180);
});

test("summarize — uses first/last NON-NULL portfolio for delta", () => {
  // Null portfolio points (insufficient data that snapshot) are skipped
  // for the numeric delta but still count toward pointCount.
  const s = summarizeTrajectory(traj([pt("2026-05-19", null), pt("2026-06-02", 300), pt("2026-06-28", 450)]));
  assert.equal(s.pointCount, 3);
  assert.equal(s.firstPortfolio, 300);
  assert.equal(s.lastPortfolio, 450);
  assert.equal(s.netPortfolioDelta, 150);
  assert.equal(s.hasTrend, true);
});

test("summarize — only one non-null portfolio → no trend", () => {
  const s = summarizeTrajectory(traj([pt("2026-05-19", null), pt("2026-06-28", 300)]));
  assert.equal(s.hasTrend, false);
  assert.equal(s.netPortfolioDelta, null);
});

// ─── buildSparkline ──────────────────────────────────────────────

test("sparkline — fewer than 2 valued points → empty", () => {
  assert.deepEqual(buildSparkline([pt("2026-06-28", 500)], 100, 30), []);
  assert.deepEqual(buildSparkline([pt("a", null), pt("b", null)], 100, 30), []);
});

test("sparkline — endpoints span the inner width; higher value sits higher (smaller y)", () => {
  const sp = buildSparkline([pt("a", 100), pt("b", 200)], 100, 30, 4);
  assert.equal(sp.length, 2);
  assert.equal(sp[0].x, 4); // pad
  assert.equal(sp[1].x, 96); // width - pad
  // 200 > 100, so b's y must be above (numerically less than) a's y
  assert.ok(sp[1].y < sp[0].y, `expected ${sp[1].y} < ${sp[0].y}`);
  assert.equal(sp[1].value, 200);
});

test("sparkline — flat series pins to vertical middle", () => {
  const sp = buildSparkline([pt("a", 300), pt("b", 300)], 100, 30, 4);
  // innerH = 22, mid = pad + 11 = 15
  assert.ok(sp.every((p) => p.y === 15), JSON.stringify(sp));
});

test("sparkline — values stay within the padded box", () => {
  const sp = buildSparkline([pt("a", 10), pt("b", 90), pt("c", 50)], 200, 40, 4);
  assert.equal(sp.length, 3);
  for (const p of sp) {
    assert.ok(p.x >= 4 && p.x <= 196, `x ${p.x}`);
    assert.ok(p.y >= 4 && p.y <= 36, `y ${p.y}`);
  }
});

// ─── attachShareOfMarket ─────────────────────────────────────────

function ptShare(date: string, t12: number | null): TrajectoryPoint {
  return {
    date,
    portfolioPoint: null,
    portfolioBand: null,
    goldCount: 0,
    silverCount: 0,
    eligible: true,
    t12ListingsCount: t12,
  };
}

test("share — count ÷ market total for that date", () => {
  const totals = new Map([
    ["2025-03-31", 400],
    ["2025-06-30", 500],
  ]);
  const out = attachShareOfMarket(
    [ptShare("2025-03-31", 100), ptShare("2025-06-30", 50)],
    totals
  );
  assert.equal(out[0].shareOfMarket, 0.25); // 100 / 400
  assert.equal(out[1].shareOfMarket, 0.1); // 50 / 500
});

test("share — null when operator's own count is null", () => {
  const out = attachShareOfMarket(
    [ptShare("2025-03-31", null)],
    new Map([["2025-03-31", 400]])
  );
  assert.equal(out[0].shareOfMarket, null);
});

test("share — null when the market total for that date is missing", () => {
  const out = attachShareOfMarket([ptShare("2025-03-31", 100)], new Map());
  assert.equal(out[0].shareOfMarket, null);
});

test("share — null when market total is zero (no div-by-zero)", () => {
  const out = attachShareOfMarket(
    [ptShare("2025-03-31", 100)],
    new Map([["2025-03-31", 0]])
  );
  assert.equal(out[0].shareOfMarket, null);
});

test("share — preserves all other point fields", () => {
  const [p] = attachShareOfMarket(
    [ptShare("2025-03-31", 100)],
    new Map([["2025-03-31", 400]])
  );
  assert.equal(p.date, "2025-03-31");
  assert.equal(p.t12ListingsCount, 100);
  assert.equal(p.eligible, true);
  assert.equal(p.shareOfMarket, 0.25);
});

// ─── aggregateMemberSnapshots (operator-level rollup) ────────────

function row(date: string, pmSlug: string, portfolioPoint: number | null, gold = 0, silver = 0): MemberSnapshotRow {
  return { date, pmSlug, portfolioPoint, goldCount: gold, silverCount: silver };
}

test("aggregate — empty → []", () => {
  assert.deepEqual(aggregateMemberSnapshots([]), []);
});

test("aggregate — sums portfolio + stars across members, counts distinct markets", () => {
  const out = aggregateMemberSnapshots([
    row("2025-12-31", "op-dallas", 300, 2, 1),
    row("2025-12-31", "op-houston", 500, 1, 0),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].portfolioPoint, 800);
  assert.equal(out[0].goldCount, 3);
  assert.equal(out[0].silverCount, 1);
  assert.equal(out[0].marketsPresent, 2);
});

test("aggregate — portfolio sums only non-null members; all-null → null", () => {
  const partial = aggregateMemberSnapshots([
    row("2025-12-31", "op-a", null, 0, 1),
    row("2025-12-31", "op-b", 250, 1, 0),
  ]);
  assert.equal(partial[0].portfolioPoint, 250); // op-a has no estimate; op-b counted
  assert.equal(partial[0].marketsPresent, 2); // both present regardless of estimate

  const none = aggregateMemberSnapshots([
    row("2025-12-31", "op-a", null),
    row("2025-12-31", "op-b", null),
  ]);
  assert.equal(none[0].portfolioPoint, null);
});

test("aggregate — marketsPresent counts DISTINCT pmSlugs, not rows", () => {
  const out = aggregateMemberSnapshots([
    row("2025-12-31", "op-a", 100),
    row("2025-12-31", "op-a", 100), // dup slug (shouldn't happen, but defensive)
    row("2025-12-31", "op-b", 100),
  ]);
  assert.equal(out[0].marketsPresent, 2);
});

test("aggregate — grouped by date, ascending; footprint can grow over time", () => {
  const out = aggregateMemberSnapshots([
    row("2025-12-31", "op-a", 100),
    row("2021-12-31", "op-a", 40),
    row("2023-12-31", "op-a", 60),
    row("2023-12-31", "op-b", 30),
  ]);
  assert.deepEqual(out.map((p) => p.date), ["2021-12-31", "2023-12-31", "2025-12-31"]);
  assert.deepEqual(out.map((p) => p.marketsPresent), [1, 2, 1]);
  assert.deepEqual(out.map((p) => p.portfolioPoint), [40, 90, 100]);
});

test("aggregate output flows through summarize + sparkline (type-compatible)", () => {
  const pts = aggregateMemberSnapshots([
    row("2021-12-31", "op-a", 100),
    row("2025-12-31", "op-a", 200),
  ]);
  const s = summarizeTrajectory({ pmSlug: "agg", points: pts });
  assert.equal(s.hasTrend, true);
  assert.equal(s.netPortfolioDelta, 100);
  assert.equal(buildSparkline(pts, 100, 30).length, 2);
});

// ─── quarter collapse ────────────────────────────────────────────

test("quarterEndDate maps any date to its quarter-end", () => {
  assert.equal(quarterEndDate("2026-01-15"), "2026-03-31");
  assert.equal(quarterEndDate("2026-05-19"), "2026-06-30");
  assert.equal(quarterEndDate("2024-07-01"), "2024-09-30");
  assert.equal(quarterEndDate("2023-10-31"), "2023-12-31");
  assert.equal(quarterEndDate("2025-12-31"), "2025-12-31"); // already a q-end
});

test("collapse — folds multiple in-quarter forward snapshots to the latest, stamped q-end", () => {
  const out = collapseMemberRowsToQuarterly([
    row("2026-05-19", "op-a", 100, 1, 0),
    row("2026-06-02", "op-a", 140, 2, 0),
    row("2026-06-28", "op-a", 180, 3, 1), // latest in Q2 → wins
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-06-30"); // stamped quarter-end
  assert.equal(out[0].portfolioPoint, 180);
  assert.equal(out[0].goldCount, 3);
});

test("collapse — keeps distinct members + distinct quarters separate", () => {
  const out = collapseMemberRowsToQuarterly([
    row("2026-03-31", "op-a", 50), // Q1
    row("2026-06-28", "op-a", 90), // Q2
    row("2026-06-28", "op-b", 30), // Q2, other member
  ]);
  assert.equal(out.length, 3);
});

test("collapse then aggregate removes the intra-quarter footprint ramp", () => {
  // op-b onboarded mid-Q2 (only a 06-28 snapshot); op-a present all Q2.
  const collapsed = collapseMemberRowsToQuarterly([
    row("2026-05-19", "op-a", 100),
    row("2026-06-28", "op-a", 120),
    row("2026-06-28", "op-b", 40),
  ]);
  const agg = aggregateMemberSnapshots(collapsed);
  assert.equal(agg.length, 1); // single Q2 point, not a 3→...→ ramp
  assert.equal(agg[0].date, "2026-06-30");
  assert.equal(agg[0].marketsPresent, 2);
  assert.equal(agg[0].portfolioPoint, 160); // op-a latest (120) + op-b (40)
});

// ─── keepCurrentGenerationSnapshots (methodology guard) ──────────

function snap(date: string, methodologyVersion: string) {
  return { snapshotDate: new Date(date), methodologyVersion, portfolio: 0 };
}

test("generation guard — keeps only the latest methodology generation (the Riparian bug)", () => {
  // Three incompatible estimator generations on one operator; only the newest
  // (matching the most-recent snapshot) survives, so the trajectory can't show
  // a methodology recalibration as a fake portfolio cliff.
  const out = keepCurrentGenerationSnapshots([
    snap("2021-12-31", "v0.6.4-recon"),
    snap("2026-06-28", "v0.6.4"),
    snap("2026-07-15", "v0.7"),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].methodologyVersion, "v0.7");
});

test("generation guard — order-independent; current = version of the latest DATE not last element", () => {
  const out = keepCurrentGenerationSnapshots([
    snap("2026-07-15", "v0.7"),
    snap("2026-06-28", "v0.6.4"),
    snap("2021-12-31", "v0.6.4-recon"),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].methodologyVersion, "v0.7");
});

test("generation guard — single generation kept in full; empty → empty", () => {
  const all = keepCurrentGenerationSnapshots([
    snap("2026-03-31", "v0.7"),
    snap("2026-06-30", "v0.7"),
  ]);
  assert.equal(all.length, 2);
  assert.deepEqual(keepCurrentGenerationSnapshots([]), []);
});

// ─── clampFutureTrajectoryDates (no future quarter-end labels) ────

test("clamp — pulls a future-stamped quarter-end back to the latest real date", () => {
  const out = clampFutureTrajectoryDates(
    [
      { date: "2026-03-31", portfolioPoint: 200, portfolioBand: null, goldCount: 0, silverCount: 0, eligible: true, marketsPresent: 1 },
      // in-progress quarter stamped to its quarter-end (Sep 30), past real data
      { date: "2026-09-30", portfolioPoint: 220, portfolioBand: null, goldCount: 0, silverCount: 0, eligible: true, marketsPresent: 1 },
    ],
    "2026-07-15"
  );
  assert.equal(out[0].date, "2026-03-31"); // past quarter untouched
  assert.equal(out[1].date, "2026-07-15"); // future quarter-end clamped to real data
});

test("clamp — no-op when maxDate is empty or all dates are in range", () => {
  const pts = [
    { date: "2026-03-31", portfolioPoint: 1, portfolioBand: null, goldCount: 0, silverCount: 0, eligible: true, marketsPresent: 1 },
  ];
  assert.deepEqual(clampFutureTrajectoryDates(pts, ""), pts);
  assert.deepEqual(clampFutureTrajectoryDates(pts, "2026-07-15"), pts);
});

// ─── source guard ────────────────────────────────────────────────

test("scorecard page renders the trajectory section", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/property-managers/[state]/[city]/[slug]/page.tsx"),
    "utf8"
  );
  assert.ok(src.includes("loadOperatorTrajectory"), "scorecard page must load the trajectory");
  // Redesign (Task 8): trajectory data is fed through buildScorecardView →
  // MomentumSection (sparklines) rather than rendered via OperatorTrajectorySection
  // directly. Verify the view model receives the trajectory.
  assert.ok(src.includes("buildScorecardView"), "scorecard page must build the view model");
  assert.ok(src.includes("trajectory:"), "scorecard page must pass trajectory to view model");
});

test("operator page renders the aggregate trajectory section", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/operators/[canonicalSlug]/page.tsx"),
    "utf8"
  );
  assert.ok(
    src.includes("loadOperatorAggregateTrajectory"),
    "operator page must load the aggregate trajectory"
  );
  assert.ok(
    src.includes("OperatorAggregateTrajectorySection"),
    "operator page must render the aggregate trajectory section"
  );
});

// ─── parseSubmarketCount ────────────────────────────────────────

test("parseSubmarketCount counts a JSON array and tolerates null/garbage", () => {
  assert.equal(parseSubmarketCount(JSON.stringify(["a", "b", "c"])), 3);
  assert.equal(parseSubmarketCount(JSON.stringify([])), 0);
  assert.equal(parseSubmarketCount(null), null);
  assert.equal(parseSubmarketCount("not json"), null);
  assert.equal(parseSubmarketCount(JSON.stringify({ a: 1 })), null);
});
