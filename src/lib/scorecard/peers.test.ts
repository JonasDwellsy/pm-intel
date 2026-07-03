import test from "node:test";
import { strict as assert } from "node:assert";
import { selectSimilarLocalPlayers, type PeerCandidate } from "./peers";

const C = (slug: string, units: number | null, q = "SFR Independent"): PeerCandidate => ({
  slug, name: slug, quadrant7Cell: q, estimatedUnits: units, operatingLabel: "good",
});

test("keeps same 7-cell, picks nearest-in-size to focal, includes focal, sorted desc", () => {
  const cands = [
    C("doorby", 644), C("river", 720), C("volunteer", 520),
    C("scenic", 410), C("lookout", 360), C("tiny", 30),
    C("apts", 900, "Large MF/BTR Independent"), // different cell — excluded
  ];
  const peers = selectSimilarLocalPlayers("doorby", cands, { limit: 4 });
  assert.deepEqual(peers.map((p) => p.slug), ["river", "doorby", "volunteer", "scenic"]);
  assert.equal(peers.find((p) => p.slug === "doorby")!.isFocal, true);
  assert.ok(peers.some((p) => p.relativeSize === 1)); // largest normalized to 1
  assert.ok(!peers.some((p) => p.quadrant7Cell === "Large MF/BTR Independent"));
});

test("focal always included even if it wouldn't rank by size alone", () => {
  const cands = [C("doorby", 50), C("a", 900), C("b", 880), C("c", 860), C("d", 840)];
  const peers = selectSimilarLocalPlayers("doorby", cands, { limit: 3 });
  assert.ok(peers.some((p) => p.slug === "doorby"));
});
