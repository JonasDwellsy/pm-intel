import test from "node:test";
import { strict as assert } from "node:assert";
import { buildMomentumNarrative, type NarrativeSignal } from "./momentum-narrative";

const NAME = "Provision Real Estate And Property Management";

test("no signals → not-enough-history sentence", () => {
  assert.equal(
    buildMomentumNarrative(NAME, [], "portfolio"),
    `Not enough history yet to read ${NAME}'s trajectory.`
  );
});

test("net-up / recent-down driver reads the full texture", () => {
  const signals: NarrativeSignal[] = [
    { key: "portfolio", net: "growing", recent: "declining" },
    { key: "reach", net: "growing", recent: "growing" },
    { key: "quality", net: "growing", recent: "growing" },
    { key: "share", net: "declining", recent: "declining" },
  ];
  const out = buildMomentumNarrative(NAME, signals, "portfolio");
  assert.match(out, /estimated portfolio has grown overall but has pulled back over recent quarters\./);
  assert.match(out, /geographic reach has widened/);
  assert.match(out, /operating-quality signals have strengthened/);
  assert.match(out, /though its share of the market's new listings has slipped\./);
});

test("monotone growth omits the 'overall/recent' hedge", () => {
  const signals: NarrativeSignal[] = [
    { key: "portfolio", net: "growing", recent: "growing" },
    { key: "reach", net: "growing", recent: "growing" },
    { key: "quality", net: "stable", recent: "stable" },
  ];
  const out = buildMomentumNarrative("Doorby", signals, "portfolio");
  assert.match(out, /^Doorby's estimated portfolio has grown\. Alongside, its geographic reach has widened\.$/);
});

test("net-down / recent-up driver reads recovery", () => {
  const out = buildMomentumNarrative(
    "Doorby",
    [{ key: "portfolio", net: "declining", recent: "growing" }],
    "portfolio"
  );
  assert.match(out, /estimated portfolio has shrunk overall but has firmed up over recent quarters\./);
});

test("flat but volatile driver says no-clear-trend, not steady", () => {
  const out = buildMomentumNarrative(
    "Doorby",
    [{ key: "portfolio", net: "stable", recent: "stable", volatile: true }],
    "portfolio"
  );
  assert.match(out, /swung from period to period without a clear net trend\./);
});

test("supporting steadies are omitted (only movers get context)", () => {
  const out = buildMomentumNarrative(
    "Doorby",
    [
      { key: "portfolio", net: "growing", recent: "growing" },
      { key: "quality", net: "stable", recent: "stable" },
    ],
    "portfolio"
  );
  // quality is steady → no "Alongside" clause about it.
  assert.equal(out, "Doorby's estimated portfolio has grown.");
});

test("falls back to first signal when driverKey is null", () => {
  const out = buildMomentumNarrative(
    "Doorby",
    [{ key: "quality", net: "growing", recent: "growing" }],
    null
  );
  assert.match(out, /operating-quality signals have strengthened\./);
});
