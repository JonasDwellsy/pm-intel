// v0.22 (3a) — input/output tests for the pure trajectory shaping. The
// loadOperatorTrajectory loader (prisma) is exercised at runtime; these
// cover the shaping the UI depends on.

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  summarizeTrajectory,
  buildSparkline,
  type OperatorTrajectory,
  type TrajectoryPoint,
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

// ─── source guard ────────────────────────────────────────────────

test("scorecard page renders the trajectory section", () => {
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const src = readFileSync(
    join(process.cwd(), "src/app/property-managers/[state]/[city]/[slug]/page.tsx"),
    "utf8"
  );
  assert.ok(src.includes("loadOperatorTrajectory"), "scorecard page must load the trajectory");
  const body = readFileSync(
    join(process.cwd(), "src/components/scorecard/ScorecardBody.tsx"),
    "utf8"
  );
  assert.ok(body.includes("OperatorTrajectorySection"), "ScorecardBody must render the trajectory section");
});
