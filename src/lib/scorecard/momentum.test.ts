import test from "node:test";
import { strict as assert } from "node:assert";
import { momentumDirection, momentumProfile, aggregateSectionDirection } from "./momentum";

test("insufficient when fewer than minPoints non-null values", () => {
  assert.equal(momentumDirection({ values: [null, 10] }), "insufficient"); // 1 real point
});

test("growing when net change exceeds the flat band", () => {
  assert.equal(momentumDirection({ values: [100, 110, 120, 135] }), "growing");
});

test("declining on a clear downtrend", () => {
  assert.equal(momentumDirection({ values: [135, 120, 110, 100] }), "declining");
});

test("stable when net change is within the flat band and low volatility", () => {
  assert.equal(momentumDirection({ values: [100, 101, 99, 100] }), "stable");
});

test("volatile when swings are large even if net change is small", () => {
  assert.equal(momentumDirection({ values: [100, 180, 60, 105] }), "volatile");
});

test("large swings with a strong net direction are growing/declining, not volatile", () => {
  // maxSwing (1.0) exceeds volatilityPct (0.4), but |netChange| (3.0) is >=
  // maxSwing/2, so the volatility guard must NOT win — net direction governs.
  assert.equal(momentumDirection({ values: [100, 200, 300, 400] }), "growing");
  assert.equal(momentumDirection({ values: [400, 300, 200, 100] }), "declining");
});

// --- momentumProfile: net + recent ---

test("momentumProfile: insufficient when below minPoints", () => {
  assert.deepEqual(momentumProfile({ values: [null, 10] }), {
    net: "stable",
    recent: "stable",
    volatile: false,
    hasEnough: false,
  });
});

test("momentumProfile: monotone rise reads growing net AND recent", () => {
  const p = momentumProfile({ values: [100, 110, 120, 130, 140] });
  assert.equal(p.net, "growing");
  assert.equal(p.recent, "growing");
  assert.equal(p.hasEnough, true);
});

test("momentumProfile: rose then fell = growing net, declining recent", () => {
  // Larger than first observed, but sliding over the recent window.
  const p = momentumProfile({ values: [100, 120, 150, 180, 160, 140, 120] });
  assert.equal(p.net, "growing");
  assert.equal(p.recent, "declining");
});

test("momentumProfile: fell then recovered = declining net, growing recent", () => {
  const p = momentumProfile({ values: [200, 180, 150, 120, 100, 110, 120] });
  assert.equal(p.net, "declining");
  assert.equal(p.recent, "growing");
});

// --- aggregateSectionDirection: cross-signal section badge ---

test("diverging signals (some up, some down) → mixed", () => {
  // Hawk-Eyed shape: portfolio down, share/reach/quality up.
  assert.equal(
    aggregateSectionDirection(["declining", "growing", "growing", "growing"]),
    "mixed"
  );
});

test("consensus directions pass through", () => {
  assert.equal(aggregateSectionDirection(["growing", "growing", "stable"]), "growing");
  assert.equal(aggregateSectionDirection(["declining", "declining"]), "declining");
  assert.equal(aggregateSectionDirection(["stable", "stable"]), "stable");
});

test("a lone up signal wins over volatile (no down present)", () => {
  assert.equal(aggregateSectionDirection(["growing", "volatile"]), "growing");
});

test("volatile only decides when nothing else has a direction", () => {
  assert.equal(aggregateSectionDirection(["volatile", "stable"]), "volatile");
});

test("insufficient inputs are ignored; all-insufficient → insufficient", () => {
  assert.equal(aggregateSectionDirection(["insufficient", "growing"]), "growing");
  assert.equal(aggregateSectionDirection(["insufficient", "insufficient"]), "insufficient");
  assert.equal(aggregateSectionDirection([]), "insufficient");
});
