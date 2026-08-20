import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard for the /sample mobile-overflow fix.
//
// The peer table's five columns have a min-content width of ~412px, which
// beats its `width: 100%` and dragged the whole scorecard sideways on a 375px
// phone — a public, unauthenticated marketing page. Same root cause as the
// methodology page tables (see methodology-table-scroll.test.ts), different
// surface and a different table idiom: this one is inline-styled, so it does
// not use the TableScroll component.
//
// Grep-level rather than a render test on purpose: ScaleFitSection needs a
// large prop graph to mount, and the thing worth pinning is one structural
// fact — the table has a clipping block parent.

const FILE = "src/components/scorecard/redesign/ScaleFitSection.tsx";

function src(): string {
  return readFileSync(join(process.cwd(), FILE), "utf8");
}

test("the peer table sits inside an overflow-x container", () => {
  const flat = src().replace(/\s+/g, " ");
  assert.match(
    flat,
    /<div style=\{\{ overflowX: "auto" \}\}> <table/,
    `the peer-comparison table in ${FILE} must be wrapped in a scroll container — ` +
      "unwrapped, its ~412px min-content width makes the whole scorecard scroll " +
      "sideways on a phone"
  );
});

test("nothing popover-shaped was added inside the peer table", () => {
  // overflow-x:auto computes overflow-y to auto, so an in-flow popover inside
  // the wrapper would be clipped. ColumnInfoTip portals to <body> for exactly
  // this reason. If one is ever mounted in this file, it must portal too —
  // this test is the tripwire that forces that decision to be conscious.
  // Match JSX usage / imports only — the wrapper's own comment names
  // ColumnInfoTip to explain the hazard, and a bare word match would flag
  // that documentation as the problem it warns about.
  const s = src();
  assert.ok(
    !/<ColumnInfoTip|import[^;]*ColumnInfoTip/.test(s),
    `${FILE} now renders a ColumnInfoTip. Confirm it still portals out of the ` +
      "peer table's overflow wrapper, then update this test."
  );
});
